# dsh-in-convo-mode-change

Change an **existing conversation's agent preset** in DeepSeek Harness without opening a new session. The session-header preset label becomes a GUI menu for **Standard**, **PTC**, **Minimal**, **Creator**, and custom presets.

Target: **DSH 0.2.1-rc.5**. This repo ships prebuilt JavaScript; no local build is needed when installing from GitHub.

## Behavior

1. Open an existing conversation and click the agent-preset label in its **header**.
2. Select a healthy preset and confirm.
3. The change applies to the **next turn**. The session ID, workspace and existing transcript are retained.

The menu disables mode selection while a turn is active. The host independently refuses changing presets during a turn, rejects subagent-owned sessions and serializes simultaneous switches. The official `agent-preset/selected` event persists the selection for resume/fork, and its Session projection updates the current label.

**Caveat:** Tool calls made under the old preset may render differently after changing the current tool catalog. Never change a preset while a tool call is in flight.

## Architecture (no custom HTTP route)

- `lib/client.js`: replaces the built-in `conversation.session.header.actions` slot cell (`id: agent-preset`, `priority: -10`). Loads presets through `ctx.remote.agentPresets.list()` and invokes `ctx.remote.commands.execute(sessionId, '/convo-mode <preset-id>', [])`.
- `lib/index.js`: registers the Host's native `/convo-mode` command. The command handler uses `agentPresets.recompose(agent.ctx, id)` and appends `agent-preset/selected` after success.
- No custom `webServer` routes, HTTP body parsers, direct browser `fetch` calls or `@deepseek-ai/dsh-agent-presets` exception imports.

The user interacts with the **GUI only**. The internal command uses DSH's existing authenticated command transport. DSH may show a normal command lifecycle entry in the transcript. The GUI reads the **settled command outcome**, not merely submission acceptance, and reports Host errors.

## Localization

The GUI uses DSH's native `locale` service, not the browser's `navigator.language`. Changing DSH's language preference updates the header and open mode menu without a reload. Built-in preset labels and descriptions reuse DSH's official `settings.agentPreset` dictionaries. Buttons and confirmations follow DSH's locale fallback rules. Custom preset names and descriptions remain the user-authored metadata and are not automatically translated.

The redundant warning about next-turn activation and historical tool rendering was removed from the menu and confirmation GUI. The caveat is still documented above for developers.

## DSH 0.2.1-rc.5 compatibility

- `agentPresets.list()` uses the native `{ ok, value }` Remote result, not the obsolete `connection.api.agentPresets.list({})`.
- The session's active preset lives at `useSessions(...).byId[sessionId].projectionValues.agentPreset`, not the former `agentPreset` shortcut.
- Updates use the official `agent-preset/selected` Session projection. No `sessions.noteAgentPreset()` calls.
- The built-in PTC preset uses ID `ptc`, not `code`.
- The Host uses `commands.register()` with native `commands.execute()`, and DSH's `agentPresets.recompose()`.
- The existing slot override must retain a priority lower than the built-in `agent-preset` label's default priority.
- DSH's active locale and built-in preset descriptions come from the native `locale` service.

These changes were cross-checked against upstream source tag `dsh-v0.2.1-rc.5`. A full Desktop/Web end-to-end test still requires a running DSH installation.

## Install

For the DSH Desktop profile:

```sh
dsh plugin --profile desktop add "git+https://github.com/iBobbyTS/dsh-in-convo-mode-change.git"
```

For the standalone Web profile, substitute `--profile web`. Restart the corresponding DSH process and reload the UI. The `cordis.patch.yml` bundle patch mounts the Host component automatically. Local development:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-in-convo-mode-change
```

Uninstall:

```sh
dsh plugin --profile desktop remove dsh-in-convo-mode-change
```

## Tests

```sh
bash test/run-tests.sh
```

Host and client unit tests have no external dependencies. The real `SlotCore` regression suite (`test/slots.test.mjs`) runs when `@deepseek-ai/dsh-client-ui-slots` is installed; otherwise the runner explicitly skips that optional integration check.

## License

MIT
