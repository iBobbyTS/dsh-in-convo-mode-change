import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

function makeClient({ language = 'zh', running = false, result = { ok: true, value: { result: { kind: 'success' } } }, roster } = {}) {
  let bundle
  const calls = { commands: [], removed: [], localeChanges: 0 }
  let active = language
  let revision = 0
  const locales = new Set()
  const dictionary = {
    zh: { Standard: '标准模式', Ptc: 'PTC 模式', Minimal: '极简模式', Cordis: '创造模式' },
    en: { Standard: 'Standard mode', Ptc: 'PTC mode', Minimal: 'Minimal mode', Cordis: 'Creator mode' },
  }
  const locale = {
    bind(name) {
      assert.equal(name, 'settings.agentPreset')
      return key => {
        const match = /^preset(Standard|Ptc|Minimal|Cordis)(Name|Description)$/.exec(key)
        return match
          ? match[2] === 'Name'
            ? dictionary[active][match[1]]
            : 'Description for ' + match[1] + ' (' + active + ')'
          : key === 'noDescription' ? 'No description' : key
      }
    },
    resolveText: values => values[active] ?? values.en,
    getSnapshot: () => ({ active, revision }),
    subscribe(fn) { locales.add(fn); return () => locales.delete(fn) },
    switchTo(id) { active = id; revision++; for (const fn of locales) fn() },
  }
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: value => [value, () => {}],
    useEffect: () => {},
    useSyncExternalStore(subscribe, getSnapshot) {
      if (locales.size === 0) subscribe(() => { calls.localeChanges++ })
      return getSnapshot()
    },
  }
  function Menu() {}
  function Toast() {}
  function IconAgentPresetOutlineRegular() {}
  function IconChevronDownOutlineRegular() {}
  function IconWarningOutlineRegular() {}
  const primitives = { Menu, Toast, IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular, IconWarningOutlineRegular }
  const document = {
    head: { appendChild(el) { el.parentNode = this }, removeChild() { calls.removed.push('style') } },
    createElement: () => ({ textContent: '', parentNode: null }),
  }
  vm.runInContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'),
    vm.createContext({ window: { __ModuleLoader__: { load(entry) { bundle = entry } } },
      navigator: { language: 'en-US' }, document, console }))
  const client = bundle.factory(id => {
    if (id === 'react') return React
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('Unexpected module ' + id)
  })
  const remotes = {
    agentPresets: { list: async () => ({ ok: true, value: { presets: roster ?? [
      { id: 'standard' }, { id: 'ptc' }, { id: 'minimal' }, { id: 'cordis' },
      { id: 'broken', broken: 'invalid' },
    ] } }) },
    commands: { execute: async (...args) => { calls.commands.push(args); return result } },
  }
  const slots = {
    inject(name, apply) { calls.seat = name; calls.register = apply; return () => calls.removed.push('slot') },
    register(options, component) { calls.options = options; calls.component = component; return () => {} },
  }
  const ctx = {
    get(name) { return name === 'slots' ? slots : name === 'remote' ? remotes : name === 'locale' ? locale : undefined },
    effect(fn) { const dispose = fn(); return () => dispose?.() },
  }
  const cleanup = client.apply(ctx)
  calls.register()
  const render = () => calls.component({ sessionId: 'session-1',
    useSessions: fn => fn({ byId: { 'session-1': {
      projectionValues: { agentPreset: 'ptc' }, running,
    } } }),
  })
  function find(node, match) {
    if (!node || typeof node !== 'object') return undefined
    if (match(node)) return node
    for (const child of node.children || []) {
      const found = find(child, match)
      if (found) return found
    }
  }
  const textOf = node => typeof node === 'string' ? node
    : node === null || typeof node !== 'object' ? '' : (node.children || []).map(textOf).join('')
  return {
    client, calls, cleanup, Menu, Toast, IconAgentPresetOutlineRegular, IconChevronDownOutlineRegular,
    menu: () => find(render(), node => node.type === Menu),
    toast: () => find(render(), node => node.type === Toast),
    textOf, setLocale: id => locale.switchTo(id),
  }
}
const tick = () => new Promise(resolve => setImmediate(resolve))

test('header uses the same native Menu and icons as official AgentPresetSeat', async () => {
  const c = makeClient()
  assert.equal(c.calls.seat, 'conversation.session.header.actions')
  assert.equal(c.calls.options.id, 'agent-preset')
  assert.equal(c.calls.options.priority, -10)
  assert.equal(c.menu().props.portal, true)
  assert.equal(c.menu().props.align, 'start')
  assert.equal(c.menu().props.selectedId, 'ptc')
  assert.equal(c.menu().props.anchor.children[0].type, c.IconAgentPresetOutlineRegular)
  assert.equal(c.menu().props.anchor.children[2].type, c.IconChevronDownOutlineRegular)
  c.menu().props.anchor.props.onClick()
  await tick()
  assert.equal(c.menu().props.open, true)
  assert.deepEqual(Array.from(c.menu().props.items, item => item.id), ['standard', 'ptc', 'minimal', 'cordis'])
  assert.equal(c.menu().props.items[0].label.props.className, 'dcm-item')
  assert.equal(c.menu().props.items[0].label.children[0].props.className, 'dcm-itemName')
  assert.equal(c.menu().props.items[0].label.children[1].props.className, 'dcm-itemDesc')
  c.cleanup()
  assert.ok(c.calls.removed.includes('style'))
})

test('selecting a mode immediately uses the original Host command without confirmation', async () => {
  const c = makeClient()
  c.menu().props.anchor.props.onClick()
  await tick()
  c.menu().props.onSelect('cordis')
  await tick()
  assert.equal(c.calls.commands.length, 1)
  assert.equal(c.calls.commands[0][0], 'session-1')
  assert.equal(c.calls.commands[0][1], '/convo-mode cordis')
  assert.deepEqual(Array.from(c.calls.commands[0][2]), [])
  assert.equal(c.menu().props.open, false)
})

test('running turns disable native menu options and cannot switch', async () => {
  const c = makeClient({ running: true })
  c.menu().props.anchor.props.onClick()
  await tick()
  assert.ok(c.menu().props.items.every(item => item.disabled))
  c.menu().props.onSelect('cordis')
  await tick()
  assert.equal(c.calls.commands.length, 0)
})

test('Host errors use native Toast without changing the preset', async () => {
  const c = makeClient({ result: { ok: true, value: { result: { kind: 'error', text: 'turn-running' } } } })
  c.menu().props.anchor.props.onClick()
  await tick()
  c.menu().props.onSelect('cordis')
  await tick()
  assert.equal(c.toast().props.text, 'turn-running')
  assert.equal(c.toast().props.holdMs, 8000)
  assert.equal(c.menu().props.selectedId, 'ptc')
})

test('DSH language changes localize native option labels and custom metadata is preserved', async () => {
  const c = makeClient({ roster: [{ id: 'ptc' }, { id: 'custom', name: 'Research', description: 'Source analysis' }] })
  assert.match(c.textOf(c.menu().props.anchor), /PTC 模式/)
  c.menu().props.anchor.props.onClick()
  await tick()
  assert.match(c.textOf(c.menu().props.items[1].label), /Source analysis/)
  c.setLocale('en')
  assert.ok(c.calls.localeChanges > 0)
  assert.match(c.textOf(c.menu().props.anchor), /PTC mode/)
  assert.match(c.textOf(c.menu().props.items[1].label), /Research/)
})

test('custom menu and confirmation styling have been eliminated', () => {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(source, /var Menu = primitives.Menu/)
  assert.match(source, /React.createElement\(Menu, \{/)
  assert.doesNotMatch(source, /React.createElement\(MenuSurface|\.dcm-panel\s*\{|\.dcm-confirm\s*\{|\.dcm-row\s*\{/)
  assert.doesNotMatch(source, /Tool calls made under the previous mode/)
})
