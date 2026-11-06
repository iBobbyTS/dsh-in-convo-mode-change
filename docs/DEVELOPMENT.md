# In-conversation preset switching: development

[User guide](../README.md)

## Switching protocol

The official `agentPresets.select()` RPC rejects a nonblank session. This plugin uses the lower-level `agentPresets.recompose()` under the Agent's maintenance reservation:

1. A mode choice in an active Turn **queues immediately**, with no interruption or mid-tool-call scope replacement.
2. On the next `agent/status: idle` transition, the Host calls the official `agent.runMaintenance()` API. This synchronously reserves the true idle phase **before** awaiting `recompose()`; any new waking input is held until maintenance releases it. If another maintenance task owns the phase, the plugin waits for `whenIdle()` and retries.
3. Only after `recompose()` succeeds does the Host append `agent-preset/selected`. The forwarded selection event clears the pending indicator; resume/fork reconstructs the new mode.
4. Deferred failures use DSH's already-forwarded `api-session/error` event, which clears the pending indicator and shows a native error Toast. A stale failure from an earlier selection never clears a later pending target.

Pending-request lifetime and user-visible scheduling limits are described in the README.

## Implementation

- `lib/client.js` shadows the built-in `conversation.session.header.actions` / `agent-preset` slot at `priority: -10`. It reads the preset roster from `ctx.remote.agentPresets.list()`, and calls `ctx.remote.commands.execute(sessionId, '/convo-mode <preset-id>', [])` after a selection.
- `lib/index.js` registers the `/convo-mode` Host command, validates the target, queues changes while running, and reserves an idle maintenance phase for `agentPresets.recompose(agent.ctx, id)`. It rejects subagent-owned sessions and logs the official selection event only on success.
- No custom HTTP route, CSS menu material, independent dropdown component, or artificial system reminder.
- Built-in names/descriptions use DSH's `settings.agentPreset` locale dictionary. The menu tracks DSH's selected UI language (not `navigator.language`); custom preset metadata displays verbatim.
- The Client subscribes to `agent-preset/selected` and `api-session/error` to reconcile pending switches, including deferred outcomes.
- The `Menu` library is in the DSH browser platform's shared module table, so no extra `dsh.client.external` declaration or local bundling is required.

## Native UI

The header uses DSH's official `Menu` from `@deepseek-ai/dsh-client-ui-primitives`, as the new-session `AgentPresetSeat` does. It supplies native rows, the selected checkmark, keyboard navigation, focus return, portal positioning, scrolling and macOS backing. Built-in labels follow DSH's selected UI language; custom metadata displays verbatim.

## Verification

From the source repository root:

```sh
bash test/run-tests.sh
```

Host and Client tests mock their services. The runner also executes a real SlotCore check when `@deepseek-ai/dsh-client-ui-slots` is installed; otherwise it explicitly reports that check as skipped. Compatibility work must compare the target DSH maintenance, preset, command, forwarding and slot contracts. Report source checks, automated checks and running Desktop UI checks separately.
