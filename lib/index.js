// Native host command for the conversation-header GUI.
// No custom HTTP route; switching is allowed only between turns.
export const name = 'dsh-in-convo-mode-change'
export const inject = ['commands', 'agentPresets']

function turnOpen(session) {
  let lastStart = -1
  let lastEnd = -1
  const events = session.events ?? []
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === 'turn/start') lastStart = i
    else if (events[i].type === 'turn/end') lastEnd = i
  }
  return lastStart > lastEnd
}

function failure(error) {
  return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
}

export function apply(ctx) {
  const pending = new Map()
  return ctx.commands.register({
    name: 'convo-mode',
    description: 'Switch the active conversation to another agent preset between turns.',
    input: { hint: '<preset-id>' },
    // The authoritative agent-preset/selected event records the target.
    recordInput: false,
    handler: async ({ agent, rawInput, signal }) => {
      const id = rawInput.trim()
      if (!id || /[\r\n]/.test(id)) {
        return { kind: 'error', text: 'Specify one agent preset id.' }
      }
      if (agent.session.header.origin === 'subagent' || agent.session.header.parentSession !== undefined) {
        return { kind: 'error', text: 'Subagent sessions cannot change preset.' }
      }
      const previous = pending.get(agent.id) ?? Promise.resolve()
      const work = previous.then(async () => {
        if (signal?.aborted) return { kind: 'error', text: 'Mode switch was cancelled.' }
        if (agent.status === 'running' || turnOpen(agent.session)) {
          return { kind: 'error', text: 'Wait for the current turn to finish before changing preset.' }
        }
        const presets = ctx.get('agentPresets')
        if (presets === undefined) return { kind: 'error', text: 'Agent preset service unavailable.' }
        const current = presets.composedPreset(agent.ctx)
        if (current === id) return { kind: 'success', text: 'Already using ' + id + '.' }
        try {
          const next = await presets.recompose(agent.ctx, id)
          agent.session.append('agent-preset/selected', { agentPreset: next.id })
          return { kind: 'success', text: 'Switched agent preset to ' + next.id + '.' }
        } catch (error) {
          return failure(error)
        }
      })
      const settled = work.then(() => undefined, () => undefined)
      pending.set(agent.id, settled)
      try { return await work }
      finally { if (pending.get(agent.id) === settled) pending.delete(agent.id) }
    },
  })
}
