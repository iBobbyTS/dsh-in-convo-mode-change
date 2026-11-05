// dsh-in-convo-mode-change — web client half (module-loader bundle).
//
// This file is the package's prebuilt client bundle: it registers one module
// with the web shell's module loader (window.__ModuleLoader__) and exports a
// Cordis client plugin. React and the official MenuSurface primitive come from
// the DSH browser platform table; services supply `slots`, `remote`, and `locale`.
//
// What it contributes: it takes the session header's `agent-preset` cell —
// normally a read-only label naming the session's current preset — and
// replaces it with a working mode switcher. Clicking it opens a menu of the
// deployment's agent presets (Standard / PTC / Minimal / Creator and any
// custom copies); picking one asks for confirmation, then calls the existing commands.execute
// Remote. The host command registered by lib/index.js recomposes the live
// session between turns and logs its new preset.
//
// The menu disables picking while the session is running a turn (the host
// refuses anyway); the built-in new-session hero chip keeps working as before.

window.__ModuleLoader__.load({
  id: 'dsh-in-convo-mode-change',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    var React = require('react')
    var MenuSurface = require('@deepseek-ai/dsh-client-ui-primitives').MenuSurface

    // ---------- localization ----------
    // Built-in copy is shared with DSH's own translated agent-preset UI.
    var BUILTIN_KEYS = { standard: 'Standard', ptc: 'Ptc', minimal: 'Minimal', cordis: 'Cordis' }

    // ---------- styling (cosmetic; never fail the plugin) ----------
    var CSS = [
      '.dcm-root { position: relative; display: inline-flex; }',
      '.dcm-trigger { box-sizing: border-box; max-width: 190px; height: 22px; display: inline-flex; align-items: center; gap: 4px; border: none; border-radius: 6px; background: var(--dsw-alias-fill-tsp-secondary); color: var(--dsw-alias-label-secondary); padding: 0 2px 0 0; font: inherit; font-size: 12px; line-height: 22px; cursor: pointer; }',
      '.dcm-trigger:hover:not(:disabled), .dcm-trigger[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-trigger:disabled { cursor: default; opacity: .6; }',
      '.dcm-icon { opacity: .7; flex: none; display: inline-flex; padding-left: 2px; }',
      '.dcm-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.dcm-chevron { color: var(--dsw-alias-label-caption); flex: none; display: inline-flex; }',
      // The official MenuSurface owns blur, fill, macOS backing and radius.
      // Only position/spacing/elevation belong to this custom layout.
      '.dcm-panel { box-sizing: border-box; position: absolute; z-index: 100; top: calc(100% + 6px); left: 0; right: auto; width: 320px; max-width: calc(100vw - 24px); display: flex; flex-direction: column; gap: 8px; border: 0; --dsw-elevation-stroke-color: var(--dsw-alias-border-l1); box-shadow: var(--dsw-elevation-prominent); padding: 10px; color: var(--dsw-alias-label-primary); }',
      '.dcm-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; line-height: 20px; }',
      '.dcm-close { display: inline-flex; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 2px; border-radius: 6px; }',
      '.dcm-close:hover { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-hint { color: var(--dsw-alias-state-business-primary); font-size: 11px; line-height: 1.5; }',
      '.dcm-rows { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2); --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2); }',
      '.dcm-row { box-sizing: border-box; display: flex; gap: 8px; width: 100%; text-align: left; border: none; background: transparent; color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 6px 8px; cursor: pointer; font: inherit; }',
      '.dcm-row:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dcm-row:disabled { cursor: default; opacity: .55; }',
      '.dcm-rowText { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }',
      '.dcm-rowName { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; line-height: 18px; }',
      '.dcm-rowDesc { color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 15px; }',
      '.dcm-check { flex: none; display: inline-flex; color: var(--dsw-alias-state-business-primary); }',
      '.dcm-trust { flex: none; border-radius: 4px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 14px; padding: 0 4px; }',
      '.dcm-confirm { display: flex; flex-direction: column; gap: 8px; }',
      '.dcm-confirmTitle { font-size: 13px; font-weight: 600; line-height: 20px; }',
      '.dcm-confirmBody { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }',
      '.dcm-confirmActions { display: flex; justify-content: flex-end; gap: 8px; }',
      '.dcm-btn { border: none; border-radius: 8px; padding: 4px 12px; font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }',
      '.dcm-btn:disabled { opacity: .5; cursor: default; }',
      '.dcm-btnGhost { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
      '.dcm-btnPrimary { background: var(--dsw-alias-button-info-fill); color: #fff; }',
      '.dcm-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 1.5; }',
      '.dcm-busy { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 1.5; }',
    ].join('\n')

    // ---------- icons ----------
    function IconModes() {
      return React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M2 4.5h7M13 4.5h1M2 11.5h1M6 11.5h8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        React.createElement('circle', { cx: 11.5, cy: 4.5, r: 1.6, fill: 'var(--dsw-alias-label-secondary)', stroke: 'currentColor', strokeWidth: 1 }),
        React.createElement('circle', { cx: 4.5, cy: 11.5, r: 1.6, fill: 'var(--dsw-alias-label-secondary)', stroke: 'currentColor', strokeWidth: 1 }),
      )
    }
    function IconChevron() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M3 4.5L6 7.5L9 4.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }
    function IconCheck() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M2.5 6.5L5 9L9.5 3.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }
    function IconClose() {
      return React.createElement('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true },
        React.createElement('path', { d: 'M3 3L9 9M9 3L3 9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      )
    }

    // ---------- shared controller state ----------
    var state = {
      options: [], // { id, trust, name?, description? } — healthy presets only
      open: false,
      sessionId: undefined, // the session the menu was opened for
      confirming: null, // preset id awaiting confirmation
      busy: false,
      loading: false,
      error: null,
      version: 0,
    }
    var listeners = new Set()
    function subscribe(fn) {
      listeners.add(fn)
      return function () { listeners.delete(fn) }
    }
    function notify() {
      var arr = [...listeners]
      for (var i = 0; i < arr.length; i++) arr[i]()
    }
    function mutate(patch) {
      Object.assign(state, patch)
      notify()
    }

    function apply(ctx) {
      // DSH's active UI language is a Host-backed preference, not the
      // browser's navigator.language.
      var locale = ctx.get('locale')
      var translatePreset = locale.bind('settings.agentPreset')
      function L(zh, en) { return locale.resolveText({ zh: zh, en: en }) }
      function subscribeLocale(listener) { return locale.subscribe(listener) }
      function getLocaleSnapshot() { return locale.getSnapshot() }

      var styleTag = null
      try {
        styleTag = document.createElement('style')
        styleTag.textContent = CSS
        document.head.appendChild(styleTag)
      } catch (err) { /* styling is cosmetic */ }

      // The rc.5 native Remotes provide a session-scoped, authenticated
      // command channel; a custom HTTP route is unnecessary.
      function remote() { return ctx.get('remote') }

      async function loadRoster() {
        var face = remote()
        if (face === undefined || face.agentPresets === undefined) {
          mutate({ loading: false, error: L('无法连接模式目录', 'Preset catalog unavailable') })
          return
        }
        var requestedSession = state.sessionId
        mutate({ loading: true, options: [], error: null })
        try {
          var response = await face.agentPresets.list()
          if (!state.open || state.sessionId !== requestedSession) return
          if (!response.ok) {
            mutate({ loading: false, error: response.error.message })
            return
          }
          var presets = response.value.presets
          var options = []
          for (var i = 0; i < presets.length; i++) {
            var preset = presets[i]
            if (preset.broken !== undefined) continue
            options.push({ id: preset.id, name: preset.name, description: preset.description })
          }
          mutate({ options: options, loading: false, error: null, version: state.version + 1 })
        } catch (err) {
          if (state.open && state.sessionId === requestedSession) {
            mutate({ loading: false, error: err instanceof Error ? err.message : String(err) })
          }
        }
      }

      async function doSwitch(sessionId, id) {
        if (state.busy || state.sessionId !== sessionId) return
        if (typeof id !== 'string' || id.trim() === '' || /[\r\n]/.test(id)) {
          mutate({ error: L('模式 ID 无效', 'Invalid preset id'), confirming: null })
          return
        }
        var face = remote()
        if (face === undefined || face.commands === undefined) {
          mutate({ error: L('命令服务不可用', 'Command service unavailable'), confirming: null })
          return
        }
        mutate({ busy: true, error: null })
        try {
          // Session.command() only acknowledges admission; commands.execute()
          // returns the authoritative command result.
          var response = await face.commands.execute(sessionId, '/convo-mode ' + id, [])
          if (state.sessionId !== sessionId) return
          if (!response.ok) throw new Error(response.error.message)
          if (response.value === undefined) {
            throw new Error(L('模式切换插件未在 Host 加载', 'Host mode-switch command not installed'))
          }
          if (response.value.result.kind !== 'success') {
            throw new Error(response.value.result.text || L('模式切换失败', 'Mode switch failed'))
          }
          // The official Session projection updates from agent-preset/selected.
          mutate({ busy: false, open: false, confirming: null, error: null })
        } catch (err) {
          if (state.sessionId === sessionId) {
            mutate({ busy: false, error: err instanceof Error ? err.message : String(err), confirming: null })
          }
        }
      }

      function openMenu(sessionId) {
        mutate({ open: true, sessionId: sessionId, error: null, confirming: null, version: state.version + 1 })
        loadRoster()
      }
      function closeMenu() {
        mutate({ open: false, confirming: null })
      }

      function presetText(option) {
        var suffix = BUILTIN_KEYS[option.id]
        if (suffix !== undefined) {
          return {
            name: translatePreset('preset' + suffix + 'Name'),
            description: translatePreset('preset' + suffix + 'Description'),
          }
        }
        return {
          name: option.name !== undefined && option.name !== null && option.name !== '' ? option.name : option.id,
          description: option.description,
        }
      }

      // ---------- the header action (replaces the read-only preset label) ----------
      function ModeSwitchAction(props) {
        // Subscribe to DSH language changes to update the header and menu
        // without requiring an application reload.
        React.useSyncExternalStore(subscribeLocale, getLocaleSnapshot)
        var snapState = React.useState(state)
        var snap = snapState[0]
        var setSnap = snapState[1]
        React.useEffect(function () {
          return subscribe(function () { setSnap(Object.assign({}, state)) })
        }, [])
        var rootRef = React.useRef(null)

        var entry
        try {
          entry = props.useSessions(function (s) { return s.byId[props.sessionId] })
        } catch (err) { entry = undefined }
        var value = entry !== undefined && entry !== null ? entry.projectionValues?.agentPreset : undefined
        var current = typeof value === 'string' ? value : undefined
        var running = entry !== undefined && entry !== null && entry.running === true

        // Close when the session changes or the menu loses focus.
        React.useEffect(function () {
          if (snap.open && props.sessionId !== state.sessionId) closeMenu()
        }, [snap.open, props.sessionId])
        React.useEffect(function () {
          if (!snap.open) return
          function onDown(ev) {
            if (rootRef.current !== null && ev.target instanceof Node && rootRef.current.contains(ev.target)) return
            closeMenu()
          }
          function onKey(ev) {
            if (ev.key !== 'Escape') return
            ev.preventDefault()
            ev.stopPropagation()
            closeMenu()
          }
          document.addEventListener('pointerdown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          return function () {
            document.removeEventListener('pointerdown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
          }
        }, [snap.open])

        if (current === undefined) return null

        var currentOption = null
        for (var i = 0; i < snap.options.length; i++) {
          if (snap.options[i].id === current) { currentOption = snap.options[i]; break }
        }
        // Localize built-in names before the preset roster has been opened.
        var currentText = presetText(currentOption !== null ? currentOption : { id: current })
        var label = currentText.name

        var triggerTitle = running
          ? L('当前回合运行中，结束后才能切换', 'Waiting for the current run to finish')
          : L('切换对话模式', 'Switch conversation mode') + (currentText !== null && currentText.description !== undefined ? ' — ' + currentText.description : '')

        return React.createElement('span', { className: 'dcm-root', ref: rootRef },
          React.createElement('button', {
            type: 'button',
            className: 'dcm-trigger',
            disabled: snap.busy,
            'aria-haspopup': 'menu',
            'aria-expanded': snap.open,
            title: triggerTitle,
            onClick: function () {
              if (snap.open) closeMenu()
              else openMenu(props.sessionId)
            },
          },
            React.createElement('span', { className: 'dcm-icon' }, IconModes()),
            React.createElement('span', { className: 'dcm-name' }, label),
            React.createElement('span', { className: 'dcm-chevron' }, IconChevron()),
          ),
          snap.open && React.createElement(MenuSurface, { className: 'dcm-panel', role: 'menu' },
            React.createElement('div', { className: 'dcm-head' },
              React.createElement('span', null, L('对话模式', 'Conversation mode')),
              React.createElement('button', { type: 'button', className: 'dcm-close', onClick: closeMenu, 'aria-label': L('关闭', 'Close') }, IconClose()),
            ),
            running && React.createElement('div', { className: 'dcm-hint' }, L('等待当前回合结束…', 'Waiting for the current run to finish…')),
            snap.error !== null && React.createElement('div', { className: 'dcm-error' }, snap.error),
            snap.confirming !== null
              ? (function () {
                  var option = null
                  for (var j = 0; j < snap.options.length; j++) {
                    if (snap.options[j].id === snap.confirming) { option = snap.options[j]; break }
                  }
                  var text = option !== null ? presetText(option) : { name: snap.confirming, description: undefined }
                  return React.createElement('div', { className: 'dcm-confirm' },
                    React.createElement('div', { className: 'dcm-confirmTitle' }, L('切换对话模式？', 'Switch conversation mode?')),
                    React.createElement('div', { className: 'dcm-confirmBody' },
                      L('之后的回合将使用「' + text.name + '」运行，现有记录保持不变。', 'Subsequent turns will run under ' + text.name + '. The existing transcript stays as-is.'),
                    ),
                    React.createElement('div', { className: 'dcm-confirmActions' },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dcm-btn dcm-btnGhost',
                        disabled: snap.busy,
                        onClick: function () { mutate({ confirming: null, error: null }) },
                      }, L('取消', 'Cancel')),
                      React.createElement('button', {
                        type: 'button',
                        className: 'dcm-btn dcm-btnPrimary',
                        disabled: snap.busy || running,
                        onClick: function () {
                          if (snap.confirming !== null && !snap.busy && !running) doSwitch(props.sessionId, snap.confirming)
                        },
                      }, L('切换', 'Switch')),
                    ),
                  )
                })()
              : snap.options.length === 0
                ? React.createElement('div', { className: 'dcm-busy' },
                    snap.loading ? L('正在加载模式…', 'Loading modes…') :
                    snap.error !== null ? '' : L('暂无可用模式', 'No presets available'))
                : React.createElement('div', { className: 'dcm-rows' },
                    snap.options.map(function (option) {
                      var text = presetText(option)
                      var selected = option.id === current
                      return React.createElement('button', {
                        type: 'button',
                        key: option.id,
                        className: 'dcm-row',
                        role: 'menuitemradio',
                        'aria-checked': selected,
                        disabled: running || snap.busy,
                        title: running ? L('等待当前回合结束', 'Waiting for the current run to finish') : text.description,
                        onClick: function () {
                          if (running || snap.busy) return
                          if (option.id === current) { closeMenu(); return }
                          mutate({ confirming: option.id, error: null })
                        },
                      },
                        React.createElement('span', { className: 'dcm-rowText' },
                          React.createElement('span', { className: 'dcm-rowName' },
                            React.createElement('span', { style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, text.name),
                            BUILTIN_KEYS[option.id] === undefined && React.createElement('span', { className: 'dcm-trust' }, L('自定义', 'Custom')),
                            selected && React.createElement('span', { className: 'dcm-check' }, IconCheck()),
                          ),
                          React.createElement('span', { className: 'dcm-rowDesc' }, text.description !== undefined && text.description !== null ? text.description : ''),
                        ),
                      )
                    }),
                  ),
            snap.busy && React.createElement('div', { className: 'dcm-busy' }, L('切换中…', 'Switching…')),
          ),
        )
      }

      // ---------- registration ----------
      var disposers = []
      var slots = ctx.get('slots')
      if (slots !== undefined) {
        disposers.push(ctx.effect(function () {
          return slots.inject('conversation.session.header.actions', function () {
            // Reusing the shipped id "agent-preset" puts us in the built-in
            // label's cell, replacing the read-only label with this menu. The
            // registry keys list cells by (id, priority) and refuses a
            // duplicate id at the SAME priority; the LOWEST priority wins the
            // cell — so a priority strictly below the built-in's default 0
            // both avoids the collision and guarantees we shadow the label.
            return slots.register({
              name: 'conversation.session.header.actions',
              id: 'agent-preset',
              priority: -10,
              order: -10,
            }, ModeSwitchAction)
          })
        }))
      }
      return function () {
        for (var i = 0; i < disposers.length; i++) {
          try { disposers[i]() } catch (err) { /* best effort */ }
        }
        if (styleTag !== null && styleTag.parentNode !== null) styleTag.parentNode.removeChild(styleTag)
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'remote', 'remote.agentPresets', 'remote.commands', 'locale']
    return module.exports
  },
})
