# Maintainer contract

This project changes the preset of an existing ordinary conversation through native DSH UI and Agent lifecycle APIs. It does not implement new presets, a replacement menu, custom transport, or an active-Turn scope swap.

- Apply recomposition only under the true idle maintenance reservation. Record the official selection event only after successful recomposition; keep queued and applying requests distinct.
- Classify subagent-owned sessions by `origin: "subagent"`. A `parentSession` field alone must not exclude an ordinary fork.
- Reuse native menu, locale, command and forwarded-event surfaces. Preserve the session identity and transcript.
- [README.md](README.md) owns installation and user-visible scheduling limits. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) owns the implementation protocol and verification.
- For lifecycle or compatibility changes, follow the documented checks against the actual target source. Distinguish mocked tests and optional SlotCore checks from running Desktop UI validation.

共同构建与交付合同见[统一规范](../docs/plugin-development.md)；`src/` 是运行逻辑编辑源，`lib/` 由构建生成。具体维护命令由本项目开发文档拥有。
