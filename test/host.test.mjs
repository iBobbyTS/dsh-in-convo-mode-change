import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function harness(options = {}) {
  const listeners = new Map()
  const appended = []
  const recomposed = []
  const broadcast = []
  let released = false
  const waiters = []
  const ctx = {
    logger: { warnings: [], warn(message) { this.warnings.push(message) } },
    commands: {
      registered: null, disposed: false,
      register(command) { this.registered = command; return () => { this.disposed = true } },
    },
    get(key) { return key === 'agentPresets' ? presets : undefined },
    on(event, callback) {
      const set = listeners.get(event) ?? new Set()
      set.add(callback)
      listeners.set(event, set)
      return () => set.delete(callback)
    },
    emit(event, ...args) {
      broadcast.push({ event, args })
      for (const callback of listeners.get(event) ?? []) callback(...args)
    },
  }
  const presets = {
    selected: options.selected ?? 'standard',
    composedPreset: () => presets.selected,
    async resolve(id) {
      if (options.resolveGate) await options.resolveGate
      if (id === 'unknown') throw new Error('Unknown preset: ' + id)
      return id === 'broken' ? { id, broken: 'failed mount' } : { id }
    },
    async recompose(scope, id) {
      recomposed.push(id)
      if (options.switchGate) await options.switchGate
      if (options.reject) throw new Error(options.reject)
      presets.selected = id
      return { id }
    },
  }
  const agent = {
    id: options.id ?? 'session-1',
    ctx: {},
    session: { header: { origin: options.origin ?? 'root', ...options.header },
      append(type, value) { appended.push({ type, value }) },
    },
    phase: options.running ? 'running' : 'idle',
    get status() { return this.phase === 'running' ? 'running' : 'idle' },
    activity: Promise.resolve(),
    runMaintenance(job) {
      if (this.phase !== 'idle') throw new Error('agent already has active work')
      this.phase = 'maintenance'
      const operation = (async () => {
        try { return await job({ aborted: false }) }
        finally {
          this.phase = 'idle'
          released = true
          for (const fn of waiters.splice(0)) fn()
        }
      })()
      this.activity = operation.then(() => {}, () => {})
      return operation
    },
    async whenIdle() {
      while (this.phase !== 'idle') {
        await new Promise(resolve => waiters.push(resolve))
        await this.activity
      }
    },
  }
  const cleanup = apply(ctx)
  const invoke = (id, signal) => ctx.commands.registered.handler({
    agent, rawInput: id, signal: signal ?? { aborted: false },
  })
  const stopTurn = () => {
    agent.phase = 'idle'
    ctx.emit('agent/status', { agent, status: 'idle' })
  }
  return { ctx, agent, invoke, stopTurn, appended, recomposed, broadcast, presets, cleanup,
    get released() { return released } }
}

test('registers the session-scoped command and lifecycle listeners', () => {
  const h = harness()
  assert.equal(name, 'dsh-in-convo-mode-change')
  assert.deepEqual(inject, ['commands', 'agentPresets'])
  assert.equal(h.ctx.commands.registered.name, 'convo-mode')
  assert.equal(h.ctx.commands.registered.recordInput, false)
  h.cleanup()
  assert.equal(h.ctx.commands.disposed, true)
})

test('idle selection reserves maintenance and records the official event', async () => {
  const h = harness()
  assert.deepEqual(await h.invoke('ptc'),
    { kind: 'success', text: 'Switched agent preset to ptc.' })
  assert.deepEqual(h.recomposed, ['ptc'])
  assert.deepEqual(h.appended, [{ type: 'agent-preset/selected', value: { agentPreset: 'ptc' } }])
  assert.equal(h.released, true)
})

test('running Turn queues immediately and recompose starts only at true idle', async () => {
  const h = harness({ running: true })
  const reply = await h.invoke('cordis')
  assert.equal(reply.kind, 'success')
  assert.match(reply.text, /^Queued preset switch to cordis/)
  assert.deepEqual(h.recomposed, [])
  h.stopTurn()
  await tick()
  assert.deepEqual(h.recomposed, ['cordis'])
  assert.equal(h.appended.at(-1)?.value.agentPreset, 'cordis')
})

test('maintenance reservation prevents a new turn from starting during async recompose', async () => {
  let release
  const switchGate = new Promise(resolve => { release = resolve })
  const h = harness({ running: true, switchGate })
  await h.invoke('ptc')
  h.stopTurn()
  await tick()
  assert.equal(h.agent.phase, 'maintenance')
  assert.throws(() => h.agent.runMaintenance(async () => {}), /already has active work/)
  assert.equal(h.appended.length, 0)
  release()
  await tick()
  assert.equal(h.agent.phase, 'idle')
  assert.equal(h.appended[0].value.agentPreset, 'ptc')
})

test('latest queued target wins while the Agent is running', async () => {
  const h = harness({ running: true })
  await h.invoke('ptc')
  await h.invoke('cordis')
  h.stopTurn()
  await tick()
  assert.deepEqual(h.recomposed, ['cordis'])
  assert.equal(h.appended[0]?.value.agentPreset, 'cordis')
})

test('selecting the currently active mode cancels the old queued target', async () => {
  const h = harness({ running: true })
  await h.invoke('ptc')
  assert.equal((await h.invoke('standard')).kind, 'success')
  h.stopTurn()
  await tick()
  assert.deepEqual(h.recomposed, [])
})

test('a second request during maintenance runs after the first completes', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = harness({ switchGate: gate })
  const first = h.invoke('ptc')
  await tick()
  assert.equal(h.agent.phase, 'maintenance')
  const second = await h.invoke('cordis')
  assert.match(second.text, /^Queued preset switch to cordis/)
  release()
  await first
  await tick()
  await tick()
  assert.deepEqual(h.recomposed, ['ptc', 'cordis'])
  assert.deepEqual(h.appended.map(x => x.value.agentPreset), ['ptc', 'cordis'])
})

test('a deferred recompose error is forwarded through the existing session error event', async () => {
  const h = harness({ running: true, reject: 'bad mount' })
  await h.invoke('ptc')
  h.stopTurn()
  await tick()
  assert.equal(h.appended.length, 0)
  const err = h.broadcast.find(x => x.event === 'api-session/error')
  assert.equal(err?.args[0], 'session-1')
  assert.match(err?.args[1] ?? '', /^\[convo-mode\] Could not switch to ptc: bad mount/)
})

test('another Host maintenance reservation is retried once truly idle', async () => {
  const h = harness()
  // Another owner is already performing maintenance; public status remains idle.
  h.agent.phase = 'maintenance'
  const response = await h.invoke('ptc')
  assert.match(response.text, /^Queued preset switch/)
  assert.deepEqual(h.recomposed, [])
  h.agent.phase = 'idle'
  // Simulate the existing owner's whenIdle waiter settling.
  h.stopTurn()
  await tick()
  assert.deepEqual(h.recomposed, ['ptc'])
})

test('broken/unknown, cancelled, and subagent requests cannot be queued', async () => {
  const h = harness({ running: true })
  assert.equal((await h.invoke('broken')).kind, 'error')
  assert.equal((await h.invoke('unknown')).kind, 'error')
  assert.equal((await h.invoke('ptc', { aborted: true })).kind, 'error')
  assert.equal((await h.invoke('ptc\ninjection')).kind, 'error')
  assert.deepEqual(h.recomposed, [])
  h.cleanup()
  const sub = harness({ running: true, origin: 'subagent' })
  assert.equal((await sub.invoke('ptc')).kind, 'error')
})

test('Agent disposal or plugin unload discards waiting requests', async () => {
  const a = harness({ running: true })
  await a.invoke('ptc')
  a.ctx.emit('agent/disposed', { agent: a.agent })
  a.stopTurn()
  await tick()
  assert.deepEqual(a.recomposed, [])
  const b = harness({ running: true })
  await b.invoke('cordis')
  b.cleanup()
  b.stopTurn()
  await tick()
  assert.deepEqual(b.recomposed, [])
})

test('an immediate switch error returns through the command without duplicate error events', async () => {
  const h = harness({ reject: 'bad mount' })
  const reply = await h.invoke('ptc')
  assert.deepEqual(reply, { kind: 'error', text: 'bad mount' })
  assert.equal(h.broadcast.filter(x => x.event === 'api-session/error').length, 0)
  assert.equal(h.appended.length, 0)
})
