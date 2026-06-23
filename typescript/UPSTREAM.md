# Upstream TypeScript Fork

This folder is a root-level fork snapshot of Microsoft TypeScript.

- Upstream: https://github.com/microsoft/TypeScript
- Tag: `v5.9.3`
- Tag commit: `c63de15a992d37f0d6cec03ac7631872838602cb`
- Local package dependency: the repo root still uses the published
  `typescript@5.9.3` package. Bun currently pulls this fork's dev dependency
  graph when `file:./typescript` is used directly, so the fork is kept as an
  explicit editable source tree for now.

The snapshot keeps the compiler source, build scripts, package metadata, `bin/`,
and published `lib/` artifacts. The upstream `tests/` directory is intentionally
not copied because the generated baseline corpus is roughly 553 MB and exceeded
the workspace volume available during setup.
