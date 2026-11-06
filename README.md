# dsh-in-convo-mode-change

Switch an existing DeepSeek Harness conversation's Agent Preset from its header. Supports Standard, PTC, Minimal, Creator and configured custom presets, using DSH's native selector and failure Toasts.

Compatibility was checked against DSH **0.2.2-rc.1** source with automated Host and Client tests. A running Desktop UI check remains separate. Prebuilt JavaScript is committed, so installation does not require a local build.

## Install

For Desktop, launch the app once, quit it, and run the command below with its bundled CLI.

```sh
dsh plugin --profile desktop add "git+https://github.com/iBobbyTS/dsh-in-convo-mode-change.git"
```

For a standalone Web profile, replace `desktop` with `web`. Restart the corresponding DSH process and reload its UI.

To remove it:

```sh
dsh plugin --profile desktop remove dsh-in-convo-mode-change
```

## Use and limits

- Open the current conversation's header selector and choose a preset. No extra confirmation is required.
- A choice during an active Turn is queued. The current preset remains selected and a pending label stays visible until the Host confirms the change. A new choice replaces an unstarted queued request; choosing the active preset cancels that request.
- Application waits for true Agent idleness, including earlier queued Turns. It does not interrupt the current Turn, and there is no forced timeout. A switch already applying completes before a newer choice can apply.
- Unapplied requests live in Host memory. After a Host restart or plugin unload, select the desired preset again.
- Subagent-owned sessions (`origin: "subagent"`) cannot switch. Ordinary forks can, including older headers containing `parentSession`.
- Switching preserves the session ID, workspace and transcript. Old tool calls can render differently after the tool catalog changes.

[Development, switching protocol and tests](docs/DEVELOPMENT.md)

## License

MIT
