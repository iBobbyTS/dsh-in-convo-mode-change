# dsh-in-convo-mode-change

Switch the **Agent Preset** of an existing DeepSeek Harness conversation through the session header. Supports Standard, PTC, Minimal, Creator, and configured custom presets.

**DSH target:** 0.2.1-rc.5. Prebuilt JavaScript is committed; installation from GitHub does not require a local build.

## UI: same native selector as DSH

The plugin now renders the **official `Menu` component** from `@deepseek-ai/dsh-client-ui-primitives`, just as DSH's own new-session `AgentPresetSeat` does. This provides native menu rows, the current-mode checkmark, keyboard navigation, focus return, portal positioning, scrolling and macOS backing. The option label layout matches the official seat's 13px/20px title, 12px/16px description, 2px gap and 280px maximum description width. The preset icon, chevron and button treatment use the same shared primitives and theme tokens.

Open the menu from the current conversation's header. Click an available mode to switch **directly**, without a separate title, close button or confirmation step. The menu aligns at the left edge of the button, automatically fits the viewport, and preserves DSH's light/dark theme.

The GUI displays Host refusals with the native `Toast`, rather than a custom popup error strip. When the Agent has an active turn, menu choices are disabled.

## Switching semantics

The official `agentPresets.select()` RPC refuses switching after a session has started (the nonblank-session lock). The plugin uses the lower-level `agentPresets.recompose()` to permit changing presets **between turns**, then appends `agent-preset/selected` so resume/fork reconstructs the latest preset. It does **not** interrupt in-flight tool calls or switch while a turn is running; the plugin Host command independently refuses that case.

Changing modes preserves the session ID, workspace and transcript. Old tool calls may render differently after a tool catalog change.

## Implementation

- `lib/client.js` shadows the built-in `conversation.session.header.actions` / `agent-preset` slot at `priority: -10`. It reads the preset roster from `ctx.remote.agentPresets.list()`, and calls `ctx.remote.commands.execute(sessionId, '/convo-mode <preset-id>', [])` after a selection.
- `lib/index.js` registers the `/convo-mode` Host command, checks running turns and subagent ownership, calls `agentPresets.recompose(agent.ctx, id)`, and logs the official selection event.
- No custom HTTP route, CSS menu material, independent dropdown component, or artificial system reminder.
- Built-in names/descriptions use DSH's `settings.agentPreset` locale dictionary. The menu tracks DSH's selected UI language (not `navigator.language`); custom preset metadata displays verbatim.
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
