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
      '@media (hover: hover) { .dcm-trigger:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover); } }',
      '.dcm-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-trigger:disabled { cursor: default; color: var(--dsw-alias-label-quaternary); }',
      '.dcm-icon { flex: none; color: var(--dsw-alias-label-primary); }',
      '.dcm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dcm-pending { flex: none; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 18px; font-weight: 400; }',
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
      // A queued target remains visible until the official selection event
      // (or an explicit deferred-failure notification) settles it.
      pendingBySession: {},
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
      function setPending(sessionId, presetId) {
        var next = Object.assign({}, state.pendingBySession)
        if (presetId === null) delete next[sessionId]
        else next[sessionId] = presetId
        mutate({ pendingBySession: next })
      }
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
        // Publish the selected target before awaiting the Remote: a very short
        // turn may finish and deliver the selection event before the command
        // response comes back.
        mutate({ open: false, busy: true, error: null })
        setPending(sessionId, id)
        try {
          var result = await remote.commands.execute(sessionId, '/convo-mode ' + id, [])
          if (!result.ok) throw new Error(result.error.message)
          if (result.value === undefined) {
            throw new Error(L('Host 中尚未加载切换命令', 'Host mode-switch command not installed'))
          }
          if (result.value.result.kind !== 'success') {
            throw new Error(result.value.result.text || L('模式切换失败', 'Mode switch failed'))
          }
          // "Queued preset switch ..." means the Host retained the request
          // until runMaintenance can claim the next true-idle boundary.
          // All other outcomes are final; the selection event (not the
          // command acknowledgement) is the authoritative applied state.
          var message = result.value.result.text || ''
          if (!message.startsWith('Queued preset switch to ') &&
              state.pendingBySession[sessionId] === id) setPending(sessionId, null)
        } catch (err) {
          if (state.pendingBySession[sessionId] === id) setPending(sessionId, null)
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
        // Recover from a missed forwarded selection event using the authoritative
        // session projection; this handles a reconnect while the menu is mounted.
        React.useEffect(function () {
          if (state.pendingBySession[props.sessionId] === current) setPending(props.sessionId, null)
        }, [props.sessionId, current])
        if (current === undefined) return null

        var currentOption = snap.options.find(function (p) { return p.id === current })
        var label = presetText(currentOption || { id: current }).name
        var pendingId = snap.pendingBySession[props.sessionId]
        var pendingOption = snap.options.find(function (p) { return p.id === pendingId })
        var pendingName = pendingId ? presetText(pendingOption || { id: pendingId }).name : ''
        var open = snap.open && snap.sessionId === props.sessionId && snap.options.length > 0
        var items = snap.options.map(function (option) {
          var copy = presetText(option)
          return {
            id: option.id,
            disabled: snap.busy,
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
          title: pendingId
            ? L('已排队，Agent 空闲后切换到：', 'Queued for the next idle boundary: ') + pendingName
            : L('切换对话模式', 'Switch conversation mode'),
          onClick: function () {
            if (snap.open) closeMenu()
            else openMenu(props.sessionId)
          },
        },
          React.createElement(PresetIcon, { className: 'dcm-icon' }),
          React.createElement('span', { className: 'dcm-name' }, label),
          React.createElement(ChevronIcon, { className: 'dcm-chevron' }),
          pendingId && React.createElement('span', { className: 'dcm-pending' },
            L('待切换：', 'Pending: ') + pendingName),
        )
        var menu = React.createElement(Menu, {
          open: open, onClose: closeMenu, items: items, selectedId: current,
          align: 'start', portal: true, className: 'dcm-root', anchor: anchor,
          onSelect: function (id) {
            if (snap.busy || (id === current && !pendingId)) return closeMenu()
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
      var remoteEvents = ctx.get('remote')
      if (remoteEvents && typeof remoteEvents.$on === 'function') {
        disposers.push(remoteEvents.$on('agent-preset/selected', function (sessionId, id) {
          if (state.pendingBySession[sessionId] === id) setPending(sessionId, null)
        }))
        disposers.push(remoteEvents.$on('api-session/error', function (sessionId, message) {
          if (typeof message !== 'string' || !message.startsWith('[convo-mode] ')) return
          var pendingId = state.pendingBySession[sessionId]
          // A prior switch can fail after a newer target was queued; never
          // clear the newer request in response to the older failure.
          if (pendingId === undefined ||
              !message.startsWith('[convo-mode] Could not switch to ' + pendingId + ':')) return
          setPending(sessionId, null)
          showError(sessionId, message.slice('[convo-mode] '.length))
        }))
        disposers.push(remoteEvents.$on('api-session/removed', function (sessionId) {
          if (state.pendingBySession[sessionId] !== undefined) setPending(sessionId, null)
        }))
      }
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
