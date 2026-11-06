# dsh-in-convo-mode-change

Switch the **Agent Preset** of an existing DeepSeek Harness conversation through the session header. Supports Standard, PTC, Minimal, Creator, and configured custom presets.

**DSH target:** 0.2.1-rc.5. Prebuilt JavaScript is committed; installation from GitHub does not require a local build.

## UI: same native selector as DSH

The plugin now renders the **official `Menu` component** from `@deepseek-ai/dsh-client-ui-primitives`, just as DSH's own new-session `AgentPresetSeat` does. This provides native menu rows, the current-mode checkmark, keyboard navigation, focus return, portal positioning, scrolling and macOS backing. The option label layout matches the official seat's 13px/20px title, 12px/16px description, 2px gap and 280px maximum description width. The preset icon, chevron and button treatment use the same shared primitives and theme tokens.

Open the menu from the current conversation's header. Click an available mode to switch **directly**, without a separate title, close button or confirmation step. The menu aligns at the left edge of the button, automatically fits the viewport, and preserves DSH's light/dark theme.

The GUI uses the native `Toast` for failures. **You can select another mode even while a Turn is running.** The current mode remains selected and the header shows `待切换：创造模式` / `Pending: Creator mode` until the Host confirms that the new mode is active. Choosing again replaces the queued target; choosing the already-active mode cancels an unstarted queued change.

## Switching semantics

The official `agentPresets.select()` RPC refuses switching after a session has started (the nonblank-session lock). The plugin uses the lower-level `agentPresets.recompose()` with a safety boundary:

1. A mode choice in an active Turn **queues immediately**, with no interruption or mid-tool-call scope replacement.
2. On the next `agent/status: idle` transition, the Host calls the official `agent.runMaintenance()` API. This synchronously reserves the true idle phase **before** awaiting `recompose()`; any new waking input is held until maintenance releases it. If another maintenance task owns the phase, the plugin waits for `whenIdle()` and retries.
3. Only after `recompose()` succeeds does the Host append `agent-preset/selected`. The forwarded selection event clears the pending indicator; resume/fork reconstructs the new mode.
4. Deferred failures use DSH's already-forwarded `api-session/error` event, which clears the pending indicator and shows a native error Toast. A stale failure from an earlier selection never clears a later pending target.

**Timing:** The queued switch waits for *true Agent idleness*, not merely a Step boundary. If other Turns are already queued, it may not take effect until those complete. There is no built-in timeout or forced cancellation. Only the latest request that has not begun maintenance is retained; a switch already executing cannot safely be interrupted, but a newer choice applies afterward.

**Lifetime:** Pending requests are held in Host memory, not durably logged. A DSH Host process restart or plugin unload discards unapplied requests. Select the mode again after restarting if needed.

Subagent-owned sessions (`origin: "subagent"`) remain ineligible for this operation. Ordinary forks remain eligible, including older headers recording a source in `parentSession`. No custom HTTP endpoint or new Remote forwarding list is required.

Changing modes preserves the session ID, workspace and transcript. Old tool calls may render differently after a tool catalog change.

## Implementation

- `lib/client.js` shadows the built-in `conversation.session.header.actions` / `agent-preset` slot at `priority: -10`. It reads the preset roster from `ctx.remote.agentPresets.list()`, and calls `ctx.remote.commands.execute(sessionId, '/convo-mode <preset-id>', [])` after a selection.
- `lib/index.js` registers the `/convo-mode` Host command, validates the target, queues changes while running, and reserves an idle maintenance phase for `agentPresets.recompose(agent.ctx, id)`. It rejects subagent-owned sessions and logs the official selection event only on success.
- No custom HTTP route, CSS menu material, independent dropdown component, or artificial system reminder.
- Built-in names/descriptions use DSH's `settings.agentPreset` locale dictionary. The menu tracks DSH's selected UI language (not `navigator.language`); custom preset metadata displays verbatim.
- The Client subscribes to `agent-preset/selected` and `api-session/error` to reconcile pending switches, including deferred outcomes.
- The `Menu` library is in the DSH browser platform's shared module table, so no extra `dsh.client.external` declaration or local bundling is required.

## Installation

Desktop profile:

```sh
dsh plugin --profile desktop add "git+https://github.com/iBobbyTS/dsh-in-convo-mode-change.git"
```

For a standalone Web profile, replace `desktop` with `web`. Restart the corresponding DSH process and reload the UI.

Removal:

```sh
dsh plugin --profile desktop remove dsh-in-convo-mode-change
```

## Tests

```sh
bash test/run-tests.sh
```

Client and Host tests use mocked services; the optional real SlotCore test requires the installed DSH UI slots package. This change has been source-checked against DSH 0.2.1-rc.5, but full Desktop UI behavior requires a running application test.

## License

MIT
