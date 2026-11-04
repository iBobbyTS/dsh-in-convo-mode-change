import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

function makeClient({ result = { ok: true, value: { commandId: '1', result: { kind: 'success' } } }, running = false } = {}) {
  const calls = { remote: [], seat: null, removed: [] }
  let bundle
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: s => [s, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }
  const document = {
    head: { appendChild(el) { el.parentNode = this }, removeChild() {} },
    createElement: () => ({ textContent: '', parentNode: null }),
  }
  const sandbox = { window: { __ModuleLoader__: { load: x => { bundle = x } } },
    document, navigator: { language: 'en-US' }, Node: class Node {}, console }
  vm.createContext(sandbox)
  vm.runInContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const mod = bundle.factory(x => { if (x === 'react') return React; throw Error(x) })
  const remote = {
    agentPresets: { list: async () => ({ ok: true, value: { presets: [
      { id: 'standard', name: 'Standard mode' }, { id: 'ptc', name: 'PTC mode' },
      { id: 'cordis', name: 'Creator mode' }, { id: 'bad', broken: 'invalid' },
    ] } }) },
    commands: { execute: async (...args) => { calls.remote.push(args); return result } },
  }
  const slots = {
    inject(seat, factory) { calls.seat = seat; calls.factory = factory; return () => calls.removed.push('inject') },
    register(options, component) { calls.options = options; calls.component = component; return () => calls.removed.push('register') },
  }
  const ctx = {
    get(k) { return k === 'remote' ? remote : k === 'slots' ? slots : undefined },
    effect(fn) { const dispose = fn(); return () => dispose?.() },
  }
  const dispose = mod.apply(ctx)
  calls.factory()
  const render = () => calls.component({ sessionId: 's1',
    useSessions: selector => selector({ byId: { s1: { projectionValues: { agentPreset: 'ptc' }, running } } }) })
  const find = (tree, pred) => {
    if (!tree || typeof tree !== 'object') return undefined
    if (pred(tree)) return tree
    for (const c of tree.children || []) { const hit = find(c, pred); if (hit) return hit }
  }
  return { mod, calls, dispose, render, find }
}
async function tick() { await new Promise(resolve => setImmediate(resolve)) }

test('rc5 slot and service bindings', () => {
  const c = makeClient()
  assert.equal(c.calls.seat, 'conversation.session.header.actions')
  assert.equal(c.calls.options.id, 'agent-preset')
  assert.equal(c.calls.options.priority, -10)
  assert.deepEqual(Array.from(c.mod.inject), ['slots', 'remote', 'remote.agentPresets', 'remote.commands'])
  assert.ok(c.find(c.render(), e => e.props.className === 'dcm-trigger'))
  c.dispose()
  assert.ok(c.calls.removed.includes('inject'))
})

test('GUI uses commands.execute instead of custom fetch', async () => {
  const c = makeClient()
  c.find(c.render(), e => e.props.className === 'dcm-trigger').props.onClick()
  await tick()
  const mode = c.find(c.render(), e => e.props.role === 'menuitemradio' && e.props['aria-checked'] === false)
  assert.ok(mode, 'preset list has other options')
  mode.props.onClick()
  const confirm = c.find(c.render(), e => e.props.className === 'dcm-btn dcm-btnPrimary')
  assert.ok(confirm, 'confirmation GUI appears')
  confirm.props.onClick()
  await tick()
  assert.equal(c.calls.remote.length, 1)
  assert.equal(c.calls.remote[0][0], 's1')
  assert.match(c.calls.remote[0][1], /^\/convo-mode (?:standard|cordis)$/)
  assert.equal(c.calls.remote[0][2].length, 0)
})

test('host refusal remains visible in the GUI', async () => {
  const c = makeClient({ result: { ok: true, value: { commandId: '2', result: { kind: 'error', text: 'turn-running' } } } })
  c.find(c.render(), e => e.props.className === 'dcm-trigger').props.onClick()
  await tick()
  c.find(c.render(), e => e.props.role === 'menuitemradio' && e.props['aria-checked'] === false).props.onClick()
  c.find(c.render(), e => e.props.className === 'dcm-btn dcm-btnPrimary').props.onClick()
  await tick()
  assert.equal(c.find(c.render(), e => e.props.className === 'dcm-error')?.children[0], 'turn-running')
})

test('running turn disables choices', async () => {
  const c = makeClient({ running: true })
  c.find(c.render(), e => e.props.className === 'dcm-trigger').props.onClick()
  await tick()
  assert.equal(c.find(c.render(), e => e.props.role === 'menuitemradio').props.disabled, true)
})
