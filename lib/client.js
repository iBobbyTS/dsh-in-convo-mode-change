// DSH 0.2.1-rc.5 client: native AgentPresetSeat-style menu in the session header.
window.__ModuleLoader__.load({
  id: 'dsh-in-convo-mode-change',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var Menu = primitives.Menu
    var Toast = primitives.Toast
    var PresetIcon = primitives.IconAgentPresetOutlineRegular
    var ChevronIcon = primitives.IconChevronDownOutlineRegular
    var WarningIcon = primitives.IconWarningOutlineRegular
    var BUILTIN = { standard: 'Standard', ptc: 'Ptc', minimal: 'Minimal', cordis: 'Cordis' }
    var CSS = [
      '.dcm-root { min-width: 54px; max-width: 100%; }',
      '.dcm-trigger { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: min(100%, 240px); min-height: 28px; padding: 0 8px; border: none; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; font-weight: 500; white-space: nowrap; cursor: pointer; }',
      '.dcm-trigger:not(:disabled):hover, .dcm-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-trigger:disabled { cursor: default; color: var(--dsw-alias-label-quaternary); }',
      '.dcm-icon { flex: none; color: var(--dsw-alias-label-primary); }',
      '.dcm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dcm-chevron { flex: none; color: var(--dsw-alias-label-caption); }',
      // Official AgentPresetSeat's nested menu label geometry.
      '.dcm-item { display: flex; flex-direction: column; gap: 2px; max-width: 280px; }',
      '.dcm-itemName { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }',
      '.dcm-itemDesc { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-caption); white-space: normal; }',
    ].join('\n')

    // One open menu across header instances; React subscribers repaint on changes.
    var state = {
      open: false, sessionId: undefined, options: [],
      busy: false, loading: false, error: null, errorSession: undefined, errorSeq: 0,
    }
    var listeners = new Set()
    function subscribe(fn) { listeners.add(fn); return function () { listeners.delete(fn) } }
    function mutate(patch) {
      Object.assign(state, patch)
      for (var listener of [...listeners]) listener()
    }

    function apply(ctx) {
      var locale = ctx.get('locale')
      var t = locale.bind('settings.agentPreset')
      function L(zh, en) { return locale.resolveText({ zh: zh, en: en }) }
      function subscribeLocale(fn) { return locale.subscribe(fn) }
      function localeSnapshot() { return locale.getSnapshot() }
      function presetText(option) {
        var suffix = BUILTIN[option.id]
        return suffix !== undefined
          ? { name: t('preset' + suffix + 'Name'), description: t('preset' + suffix + 'Description') }
          : { name: option.name || option.id, description: option.description }
      }

      var style = document.createElement('style')
      style.textContent = CSS
      document.head.appendChild(style)
      function closeMenu() { mutate({ open: false }) }
      function showError(sessionId, error) {
        mutate({
          open: false, loading: false, error: error,
          errorSession: sessionId, errorSeq: state.errorSeq + 1,
        })
      }

      async function loadRoster(sessionId) {
        var remote = ctx.get('remote')
        if (!remote || !remote.agentPresets) {
          showError(sessionId, L('模式目录不可用', 'Preset catalog unavailable'))
          return
        }
        mutate({ loading: true, options: [] })
        try {
          var response = await remote.agentPresets.list()
          if (!state.open || state.sessionId !== sessionId) return
          if (!response.ok) return showError(sessionId, response.error.message)
          var options = response.value.presets
            .filter(function (p) { return p.broken === undefined })
            .map(function (p) { return { id: p.id, name: p.name, description: p.description } })
          if (options.length === 0) return showError(sessionId, L('暂无可用模式', 'No presets available'))
          mutate({ options: options, loading: false })
        } catch (err) {
          if (state.open && state.sessionId === sessionId) {
            showError(sessionId, err instanceof Error ? err.message : String(err))
          }
        } finally {
          if (state.sessionId === sessionId) mutate({ loading: false })
        }
      }

      function openMenu(sessionId) {
        mutate({ open: true, sessionId: sessionId, error: null })
        void loadRoster(sessionId)
      }

      async function selectPreset(sessionId, id) {
        if (state.busy || state.sessionId !== sessionId) return
        var remote = ctx.get('remote')
        if (!remote || !remote.commands) {
          showError(sessionId, L('命令服务不可用', 'Command service unavailable'))
          return
        }
        if (typeof id !== 'string' || !id.trim() || /[\r\n]/.test(id) ||
            !state.options.some(function (p) { return p.id === id })) {
          showError(sessionId, L('模式 ID 无效', 'Invalid preset id'))
          return
        }
        mutate({ open: false, busy: true, error: null })
        try {
          var result = await remote.commands.execute(sessionId, '/convo-mode ' + id, [])
          if (!result.ok) throw new Error(result.error.message)
          if (result.value === undefined) {
            throw new Error(L('Host 中尚未加载切换命令', 'Host mode-switch command not installed'))
          }
          if (result.value.result.kind !== 'success') {
            throw new Error(result.value.result.text || L('模式切换失败', 'Mode switch failed'))
          }
          // Host's agent-preset/selected event updates the Session projection.
        } catch (err) {
          showError(sessionId, err instanceof Error ? err.message : String(err))
        } finally {
          mutate({ busy: false })
        }
      }

      function ModeSwitchAction(props) {
        React.useSyncExternalStore(subscribeLocale, localeSnapshot)
        var snapshotPair = React.useState(state)
        var snap = snapshotPair[0]
        var setSnap = snapshotPair[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var entry = props.useSessions(function (s) { return s.byId[props.sessionId] })
        var value = entry && entry.projectionValues?.agentPreset
        var current = typeof value === 'string' ? value : undefined
        var running = !!(entry && entry.running)
        React.useEffect(function () {
          if (state.open && state.sessionId !== props.sessionId) closeMenu()
        }, [props.sessionId, snap.open])
        if (current === undefined) return null

        var currentOption = snap.options.find(function (p) { return p.id === current })
        var label = presetText(currentOption || { id: current }).name
        var open = snap.open && snap.sessionId === props.sessionId && snap.options.length > 0
        var items = snap.options.map(function (option) {
          var copy = presetText(option)
          return {
            id: option.id,
            disabled: running || snap.busy,
            label: React.createElement('span', { className: 'dcm-item' },
              React.createElement('span', { className: 'dcm-itemName' }, copy.name),
              React.createElement('span', { className: 'dcm-itemDesc' }, copy.description || t('noDescription')),
            ),
          }
        })
        var anchor = React.createElement('button', {
          type: 'button', className: 'dcm-trigger',
          'aria-haspopup': 'menu', 'aria-expanded': open,
          disabled: snap.busy,
          title: running
            ? L('当前回合运行中，结束后才能切换', 'Wait for the current turn to finish')
            : L('切换对话模式', 'Switch conversation mode'),
          onClick: function () {
            if (snap.open) closeMenu()
            else openMenu(props.sessionId)
          },
        },
          React.createElement(PresetIcon, { className: 'dcm-icon' }),
          React.createElement('span', { className: 'dcm-name' }, label),
          React.createElement(ChevronIcon, { className: 'dcm-chevron' }),
        )
        var menu = React.createElement(Menu, {
          open: open, onClose: closeMenu, items: items, selectedId: current,
          align: 'start', portal: true, className: 'dcm-root', anchor: anchor,
          onSelect: function (id) {
            if (running || snap.busy || id === current) return closeMenu()
            void selectPreset(props.sessionId, id)
          },
        })
        var error = snap.error !== null && snap.errorSession === props.sessionId
          ? React.createElement(Toast, {
              key: snap.errorSeq, text: snap.error,
              icon: React.createElement(WarningIcon, null),
              holdMs: 8000,
              onDone: function () {
                if (state.errorSeq === snap.errorSeq) mutate({ error: null })
              },
            })
          : null
        return React.createElement(React.Fragment, null, menu, error)
      }

      var disposers = []
      var slots = ctx.get('slots')
      if (slots !== undefined) {
        disposers.push(ctx.effect(function () {
          return slots.inject('conversation.session.header.actions', function () {
            return slots.register({
              name: 'conversation.session.header.actions',
              id: 'agent-preset', priority: -10, order: -10,
            }, ModeSwitchAction)
          })
        }))
      }
      return function () {
        for (var i = 0; i < disposers.length; i++) {
          try { disposers[i]() } catch (_) { /* best effort */ }
        }
        if (style.parentNode) style.parentNode.removeChild(style)
      }
    }
    exports.apply = apply
    exports.inject = ['slots', 'remote', 'remote.agentPresets', 'remote.commands', 'locale']
    return module.exports
  },
})
