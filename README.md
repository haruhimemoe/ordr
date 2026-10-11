# @haruhimemoe/ordr

A client for [o!rdr](https://ordr.issou.best), the online osu! replay renderer, used by the haruhime.moe tools:

- **Renders:** queue a render from `.osr` bytes or a replay URL, with every danser setting o!rdr takes, then wait for the video.
- **Polling, no socket.io:** progress comes from `GET /ordr/renders`, so there's nothing to install but zod. Apps that want push events can connect to o!rdr's websocket themselves.
- **Match maps:** `renderMatchMap` renders every player's replay of one map from a match (a tourney map nobody streamed, say) and collects the videos.
- **Errors you can branch on:** every failure is an `OrdrError` with o!rdr's numeric code, its meaning, and whether retrying can help.

Server-side: your o!rdr key must stay secret, so don't ship it to a browser.

## Install

```sh
npm install @haruhimemoe/ordr zod
# or
bun add @haruhimemoe/ordr zod
```

`zod` (4.0.16 or later in 4.x) is a peer dependency. Node 22.12 or later.

## Usage

```ts
import { createOrdrClient, OrdrError } from "@haruhimemoe/ordr";

const ordr = createOrdrClient({
  apiKey: process.env.ORDR_KEY, // or ORDR_DEV_KEYS.success while testing
  userAgent: "my-tool/1.0 (https://example.com)",
});

try {
  const { renderId } = await ordr.createRender({
    replay: osrBytes, // or replayUrl: "https://..."
    skin: "default",
    resolution: "1280x720",
    discordUserId: "123", // verified bots: per-user limits and saved presets
  });
  const { videoUrl } = await ordr.waitForRender(renderId, {
    onProgress: ({ progress }) => console.log(progress),
  });
  console.log(videoUrl);
} catch (error) {
  if (error instanceof OrdrError) console.log(error.code, error.ordrCode, error.message);
}
```

Without a key, o!rdr allows one render per 5 minutes. Ask `masterioo` on Discord for one.

### Testing against o!rdr

Use a dev-mode key (`ORDR_DEV_KEYS.success`, `.fail` or `.wsFail`) as `apiKey`. o!rdr simulates the render with a random id instead of rendering. Tests in this repo never call o!rdr at all.

## API

### `createOrdrClient(options?)`

| Option | Default | Notes |
| --- | --- | --- |
| `apiKey` | none | Sent as `verificationKey` on renders; needed for `getBotPreset` |
| `baseUrl` | `ORDR_BASE_URL` (`https://apis.issou.best`) | |
| `fetch` | `globalThis.fetch` | |
| `userAgent` | none | Sent as `User-Agent` |
| `timeoutMs` | `ORDR_TIMEOUT_MS` (30 s) | Per request, until the whole answer is read |

Throws `RangeError` for a `baseUrl` that isn't an absolute http(s) URL without a query or hash, or a `timeoutMs` that isn't positive.

### `createRender(request)`

Resolves to `{ renderId }` once o!rdr queues the render. `request` takes:

- the replay: `replay` (`Blob` or `Uint8Array`, with an optional `filename`) or `replayUrl`
- `skin` (a built-in skin's name or id, or a custom skin id with `customSkin: true`) and `resolution` (`960x540` or `1280x720`; `1920x1080` and `3840x2160` need o!rdr's permission)
- `visibility` (`PUBLIC`, `UNLISTED`, `PRIVATE`; the last two need permission), `generateThumbnail`, `discordUserId`, `usePreset`, `signal`
- any danser setting from o!rdr's docs (`showScoreboard`, `cursorSize`, `inGameBGDim`, `ignoreFail`, ...). Left out, o!rdr's default applies.

Booleans and numbers are sent as the lowercase strings o!rdr wants. A non-finite number or a bad `replayUrl` throws `RangeError` before any request.

### `waitForRender(renderId, options?)`

Polls until the render has a video and resolves to `{ renderId, videoUrl, render }`. Options: `intervalMs` (default `ORDR_POLL_INTERVAL_MS`, 5 s), `timeoutMs` (default `ORDR_WAIT_TIMEOUT_MS`, 30 min), `onProgress` (called when o!rdr's progress text changes) and `signal`.

### Reading

- `getRender(renderId)`: one render, or `null`.
- `listRenders({ page, pageSize, renderId, beatmapsetId, link, noBots })`: `{ renders, total }`.
- `downloadLink(renderId)`: a temporary direct `.mp4` URL, for bots that download videos.
- `listSkins({ page, pageSize, search })`: `{ skins, total }`.
- `getCustomSkin(skinId)`: `{ name, author, downloadLink }`, or `null` when it doesn't exist or was deleted.
- `getBotPreset(discordUserId)`: the user's preset set to "used with bots", or `null`. Needs `apiKey`. o!rdr already applies it when `createRender` gets `discordUserId`; this is for showing it.

### `renderMatchMap(client, options)`

Renders every player's replay of one map and resolves to one result per replay, in the order given:

```ts
const results = await renderMatchMap(ordr, {
  replays: [
    { label: "player1", replay: p1Osr },
    { label: "player2", replayUrl: "https://example.com/p2.osr" },
  ],
  render: { skin: "default", resolution: "1280x720", showScoreboard: false },
  onUpdate: ({ label, progress }) => console.log(label, progress),
});
// [{ label: "player1", ok: true, renderId, videoUrl, render }, { label: "player2", ok: false, renderId, error }]
```

o!rdr renders one replay per video, so a match map gives one video per player. Putting them into one video (side by side, a grid) is up to you, for example with ffmpeg on your server.

Replays are submitted one at a time, `submitGapMs` apart (default 1 s). A refusal that can pass (`retryable`) is resubmitted up to `submitRetries` times (default 2), waiting for o!rdr's `Retry-After` or 10 s, 20 s. One player's failure doesn't stop the others. `wait` passes `intervalMs` and `timeoutMs` to `waitForRender`. It rejects only on abort, and throws `RangeError` for no replays or two with the same `label`.

Getting the replays is the caller's job: osu! doesn't keep replays of stable multiplayer scores, so players or referees have to supply the `.osr` files.

## Errors

Every failure is an `OrdrError`, except aborts (rejected with the signal's reason) and bad arguments (`RangeError`).

| `code` | When |
| --- | --- |
| `network` | No answer. Retryable. |
| `timeout` | A request took longer than `timeoutMs`, or a render longer than `waitForRender`'s. Retryable. |
| `bad_response` | An answer this client can't read |
| `http_error` | Another HTTP error. Retryable for 429 and 5xx, with `retryAfterMs` when o!rdr sent `Retry-After`. |
| `rejected` | o!rdr refused the render; `ordrCode` says why |
| `render_failed` | A queued render failed; `ordrCode` says why |
| `render_removed` | The render was removed |

Fields: `code`, `ordrCode`, `status`, `retryable`, `retryAfterMs`, `renderId`, `message` (o!rdr's reason in plain words when `ordrCode` is known).

`ORDR_ERROR_CODES` maps every o!rdr code (1 to 54) to its meaning. `isRetryableOrdrCode(code)` is true for outages and renderer trouble: 4, 10, 18, 22, 23, 27, 28, 40, 41, 54.

## Etiquette

- Name your tool with `userAgent`.
- Use dev-mode keys while building, so o!rdr's queue isn't flooded with test renders.
- Verified bots: pass `discordUserId` so o!rdr rate-limits per user, not per bot.

## Compatibility

Node 22.12 or later, ESM only. zod 4.0.16 or later in 4.x. o!rdr API rev24g (Sep 28, 2026).

## License

MIT
