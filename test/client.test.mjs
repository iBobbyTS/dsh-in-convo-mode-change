import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

function makeClient({ result = { ok: true, value: { commandId: '1', result: { kind: 'success' } } }, running = false, language = 'zh' } = {}) {
  const calls = { remote: [], seat: null, removed: [], localeNotifications: 0 }
  let snapshot = { active: language, revision: 0 }
  const listeners = new Set()
  const names = {
    zh: { Standard: '标准模式', Ptc: 'PTC 模式', Minimal: '极简模式', Cordis: '创造模式' },
    en: { Standard: 'Standard mode', Ptc: 'PTC mode', Minimal: 'Minimal mode', Cordis: 'Creator mode' },
  }
  const locale = {
    bind(ns) {
      assert.equal(ns, 'settings.agentPreset')
      return key => {
        const match = /^preset(Standard|Ptc|Minimal|Cordis)(Name|Description)$/.exec(key)
        if (!match) return key
        return match[2] === 'Name' ? names[snapshot.active][match[1]] : 'Localized description (' + snapshot.active + ')'
      }
    },
    resolveText(dict) { return dict[snapshot.active] ?? dict.en },
    getSnapshot() { return snapshot },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    setLocale(next) {
      snapshot = { active: next, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener()
    },
  }
  let bundle
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: s => [s, () => {}],
    useSyncExternalStore(subscribe, getSnapshot) {
      if (!calls.localeDispose) calls.localeDispose = subscribe(() => { calls.localeNotifications++ })
      return getSnapshot()
    },
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
    get(k) { return k === 'remote' ? remote : k === 'slots' ? slots : k === 'locale' ? locale : undefined },
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
  const textOf = node => typeof node === 'string' ? node : !node || typeof node !== 'object'
    ? '' : (node.children || []).map(textOf).join('')
  return { mod, calls, dispose, render, find, textOf, setLocale: id => locale.setLocale(id) }
}
async function tick() { await new Promise(resolve => setImmediate(resolve)) }

test('rc5 slot and service bindings', () => {
  const c = makeClient()
  assert.equal(c.calls.seat, 'conversation.session.header.actions')
  assert.equal(c.calls.options.id, 'agent-preset')
  assert.equal(c.calls.options.priority, -10)
  assert.deepEqual(Array.from(c.mod.inject), ['slots', 'remote', 'remote.agentPresets', 'remote.commands', 'locale'])
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

test('DSH Chinese setting overrides English browser and caption is gone', async () => {
  const c = makeClient({ language: 'zh' }) // sandbox navigator.language is en-US
  const trigger = c.find(c.render(), e => e.props.className === 'dcm-trigger')
  assert.match(c.textOf(trigger), /PTC 模式/)
  trigger.props.onClick()
  await tick()
  const menu = c.find(c.render(), e => e.props.className === 'dcm-panel')
  assert.match(c.textOf(menu), /对话模式/)
  assert.match(c.textOf(menu), /标准模式/)
  assert.match(c.textOf(menu), /创造模式/)
  assert.equal(c.find(menu, e => e.props.className === 'dcm-caption'), undefined)
  assert.doesNotMatch(c.textOf(menu), /Applies from the next turn|Tool calls made under the previous mode/)
})

test('changing DSH language updates open menu and confirmation', async () => {
  const c = makeClient({ language: 'zh' })
  c.find(c.render(), e => e.props.className === 'dcm-trigger').props.onClick()
  await tick()
  c.setLocale('en')
  assert.ok(c.calls.localeNotifications > 0)
  assert.match(c.textOf(c.render()), /PTC mode/)
  assert.match(c.textOf(c.render()), /Conversation mode/)
  const other = c.find(c.render(), e => e.props.role === 'menuitemradio' && e.props['aria-checked'] === false)
  other.props.onClick()
  assert.match(c.textOf(c.render()), /Switch conversation mode/)
  assert.doesNotMatch(c.textOf(c.render()), /Tool calls made under the previous mode/)
})
