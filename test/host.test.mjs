import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

function harness(events = [], extra = {}) {
  const appended = []
  const calls = []
  const presets = {
    selected: 'standard',
    composedPreset: () => presets.selected,
    async recompose(ctx, id) {
      calls.push([ctx, id])
      if (extra.reject) throw new Error(extra.reject)
      if (extra.gate) await extra.gate
      presets.selected = id
      return { id }
    },
  }
  const session = {
    events,
    header: { origin: extra.origin ?? 'root', ...extra.header },
    append(type, data) { appended.push({ type, data }) },
  }
  const agent = { id: 's1', ctx: { token: 1 }, session, status: extra.status ?? 'idle' }
  const service = {
    registered: undefined, disposed: false,
    register(c) { this.registered = c; return () => { this.disposed = true } },
  }
  const ctx = { commands: service, get(k) { return k === 'agentPresets' ? presets : undefined } }
  const dispose = apply(ctx)
  const invoke = (id, signal) => service.registered.handler({ agent, rawInput: id, signal: signal ?? { aborted: false } })
  return { agent, presets, calls, appended, service, dispose, invoke }
}

test('native command registration (no web server)', () => {
  const h = harness()
  assert.equal(name, 'dsh-in-convo-mode-change')
  assert.deepEqual(inject, ['commands', 'agentPresets'])
  assert.equal(h.service.registered.name, 'convo-mode')
  assert.equal(h.service.registered.recordInput, false)
  h.dispose()
  assert.equal(h.service.disposed, true)
})

test('switches a completed session and records the official event', async () => {
  const h = harness([{ type: 'turn/start' }, { type: 'turn/end' }])
  assert.deepEqual(await h.invoke(' ptc '), { kind: 'success', text: 'Switched agent preset to ptc.' })
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0][1], 'ptc')
  assert.deepEqual(h.appended, [{ type: 'agent-preset/selected', data: { agentPreset: 'ptc' } }])
})

test('idempotent selections do not write redundant events', async () => {
  const h = harness()
  assert.equal((await h.invoke('standard')).kind, 'success')
  assert.equal(h.calls.length, 0)
  assert.equal(h.appended.length, 0)
})

test('refuses open turn and running agent', async () => {
  for (const extra of [
    { events: [{ type: 'turn/start' }] },
    { events: [], status: 'running' },
  ]) {
    const h = harness(extra.events, extra)
    assert.equal((await h.invoke('ptc')).kind, 'error')
    assert.equal(h.calls.length, 0)
  }
})

test('refuses subagent-owned sessions', async () => {
  for (const extra of [{ origin: 'subagent' }, { header: { parentSession: 'parent-1' } }]) {
    const h = harness([], extra)
    assert.equal((await h.invoke('ptc')).kind, 'error')
    assert.equal(h.calls.length, 0)
  }
})

test('invalid and cancelled requests do not mutate', async () => {
  const h = harness()
  assert.equal((await h.invoke(' ')).kind, 'error')
  assert.equal((await h.invoke('ptc\nmalicious')).kind, 'error')
  assert.equal((await h.invoke('ptc', { aborted: true })).kind, 'error')
  assert.equal(h.calls.length, 0)
})

test('recompose failures return error and never claim success', async () => {
  const h = harness([], { reject: 'invalid preset' })
  assert.deepEqual(await h.invoke('bad'), { kind: 'error', text: 'invalid preset' })
  assert.equal(h.appended.length, 0)
})

test('simultaneous switches on one session are serialized', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const h = harness([], { gate })
  const a = h.invoke('ptc')
  const b = h.invoke('cordis')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.calls.length, 1)
  release()
  assert.equal((await a).kind, 'success')
  assert.equal((await b).kind, 'success')
  assert.deepEqual(h.calls.map(c => c[1]), ['ptc', 'cordis'])
  assert.deepEqual(h.appended.map(x => x.data.agentPreset), ['ptc', 'cordis'])
})
