// Host side: GUI commands are accepted during a turn and applied at a true
// idle boundary under runMaintenance. A maintenance reservation blocks new
// turn starts until recompose and the durable selection event have settled.
export const name = 'dsh-in-convo-mode-change'
export const inject = ['commands', 'agentPresets']

const QUEUED = 'Queued preset switch to '
const FAILED = '[convo-mode] '

function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx) {
  // Agent identity, not just session ID, so a resumed agent never inherits a
  // pending request from an earlier incarnation.
  const pending = new Map()
  const generations = new Map()
  const active = new Set()
  const retrying = new Set()
  let disposed = false
  const presets = ctx.get('agentPresets')

  function reportFailure(agent, id, error) {
    const message = FAILED + 'Could not switch to ' + id + ': ' + errorText(error)
    try {
      // Existing DSH session-scoped event: forwarded to the owning Client.
      // Unlike a custom event, it requires no new Remote allowlist entry.
      ctx.emit('api-session/error', agent.id, message)
    } catch (notifyError) {
      ctx.logger?.warn('convo-mode: failure notification failed: ' + errorText(notifyError))
    }
    ctx.logger?.warn(message)
  }

  function waitForIdle(agent) {
    if (retrying.has(agent) || disposed) return
    retrying.add(agent)
    void agent.whenIdle().then(
      () => {
        retrying.delete(agent)
        if (!disposed) drain(agent)
      },
      (error) => {
        retrying.delete(agent)
        if (!disposed) {
          const item = pending.get(agent)
          if (item !== undefined) {
            pending.delete(agent)
            reportFailure(agent, item.id, error)
          }
        }
      },
    )
  }

  // Reserve the true idle phase *synchronously*. Do not rely on a status flag
  // around an awaited recompose; a new user turn could start in the gap.
  function drain(agent, notifyDeferred = true) {
    if (disposed || active.has(agent)) return undefined
    const item = pending.get(agent)
    if (item === undefined || agent.status !== 'idle') return undefined
    let task
    try {
      task = agent.runMaintenance(async (signal) => {
        if (signal.aborted) throw new Error('Agent maintenance was cancelled before switching')
        const current = presets.composedPreset(agent.ctx)
        if (current === item.id) return { kind: 'success', text: 'Already using ' + item.id + '.' }
        const selected = await presets.recompose(agent.ctx, item.id)
        // Once the scope changed, log the change even if disposal/cancellation
        // arrived during recompose, to keep resume/fork reconstruction honest.
        try {
          agent.session.append('agent-preset/selected', { agentPreset: selected.id })
        } catch (writeError) {
          // Try to recover the original composition if the durable log cannot
          // record the new one. Do not report a completed switch.
          try { await presets.recompose(agent.ctx, current) }
          catch (rollbackError) { ctx.logger?.warn('convo-mode: rollback failed: ' + errorText(rollbackError)) }
          throw writeError
        }
        return { kind: 'success', text: 'Switched agent preset to ' + selected.id + '.' }
      })
    } catch (_busy) {
      // Agent.status deliberately reports 'idle' during maintenance. Another
      // owner may already hold that phase; wait for true idle and retry.
      waitForIdle(agent)
      return undefined
    }
    pending.delete(agent)
    active.add(agent)
    const completed = task.then(
      result => result,
      error => {
        if (notifyDeferred) reportFailure(agent, item.id, error)
        else ctx.logger?.warn('convo-mode: immediate switch failed: ' + errorText(error))
        return { kind: 'error', text: errorText(error) }
      },
    ).finally(() => {
      active.delete(agent)
      if (!disposed && pending.has(agent)) drain(agent)
    })
    return completed
  }

  const stopStatus = ctx.on('agent/status', ({ agent, status }) => {
    if (!disposed && status === 'idle' && pending.has(agent)) drain(agent)
  })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => {
    pending.delete(agent)
    retrying.delete(agent)
    generations.delete(agent)
  })

  const stopCommand = ctx.commands.register({
    name: 'convo-mode',
    description: 'Switch the Agent preset now, or queue it until the Agent is idle.',
    input: { hint: '<preset-id>' },
    recordInput: false,
    handler: async ({ agent, rawInput, signal }) => {
      const id = rawInput.trim()
      if (!id || /[\r\n]/.test(id)) return { kind: 'error', text: 'Specify one agent preset id.' }
      if (agent.session.header.origin === 'subagent') {
        return { kind: 'error', text: 'Subagent sessions cannot change preset.' }
      }
      if (disposed || signal?.aborted) return { kind: 'error', text: 'Mode switch was cancelled.' }
      if (presets === undefined) return { kind: 'error', text: 'Agent preset service unavailable.' }

      // A slower validation must not overwrite a newer selection.
      const generation = (generations.get(agent) ?? 0) + 1
      generations.set(agent, generation)
      try {
        const resolved = await presets.resolve(id)
        if (resolved.broken !== undefined) {
          return { kind: 'error', text: 'Preset ' + id + ' is unavailable: ' + resolved.broken }
        }
      } catch (error) {
        return { kind: 'error', text: errorText(error) }
      }
      if (disposed || signal?.aborted) return { kind: 'error', text: 'Mode switch was cancelled.' }
      if (generations.get(agent) !== generation) {
        return { kind: 'success', text: 'Superseded by a newer preset selection.' }
      }
      const current = presets.composedPreset(agent.ctx)
      if (current === id && !active.has(agent)) {
        pending.delete(agent)
        return { kind: 'success', text: 'Already using ' + id + '.' }
      }

      pending.set(agent, { id })
      // A fresh invocation while idle is still reserved under maintenance;
      // this is distinct from a running Turn's fire-and-forget queue.
      const immediate = drain(agent, false)
      if (immediate !== undefined) return await immediate
      return { kind: 'success', text: QUEUED + id + ' until the Agent becomes idle.' }
    },
  })

  return function dispose() {
    disposed = true
    pending.clear()
    generations.clear()
    stopCommand()
    stopStatus()
    stopDisposed()
  }
}
