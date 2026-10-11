# Changelog

All notable changes to `@haruhimemoe/ordr` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Added

- `createOrdrClient` with `createRender` (replay bytes or URL, every danser setting), `waitForRender` (polling, progress, timeout), `getRender`, `listRenders`, `downloadLink`, `listSkins`, `getCustomSkin` and `getBotPreset`.
- `renderMatchMap`: one render per player of a match map, paced, with retries for passing refusals.
- `OrdrError`, `ORDR_ERROR_CODES` (o!rdr codes 1 to 54) and `isRetryableOrdrCode`.
- `ORDR_DEV_KEYS` for o!rdr's dev mode.

[unreleased]: https://github.com/haruhimemoe/ordr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/haruhimemoe/ordr/releases/tag/v0.1.0
