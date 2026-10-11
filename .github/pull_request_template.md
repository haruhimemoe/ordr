## Summary

<!-- What changed and why. Link the issue if there is one. -->

## Checklist (AGENTS.md, "Before calling a change done")

- [ ] `bun run check && bun run typecheck && bun run test:coverage && bun run test:dist`
- [ ] `README.md` matches every export, option, default and error code I changed (and `llms.txt` if a section moved)
- [ ] A line under `## [Unreleased]` in `CHANGELOG.md` for anything users will notice
- [ ] New or removed exports are pinned in `tests/exports.test.ts`
