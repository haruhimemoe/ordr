/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package the way apps will (dist/) and queues, polls and fails a render
 *       against a stub fetch. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import assert from "node:assert/strict";
import { createOrdrClient, OrdrError, renderMatchMap } from "../dist/index.js";

const done = {
  renderID: 7,
  date: "",
  username: "",
  progress: "Done.",
  errorCode: 0,
  removed: false,
  videoUrl: "https://v.test/7",
};
const ordr = createOrdrClient({
  fetch: async (_input, init) =>
    init?.method === "POST"
      ? Response.json({ renderID: 7 }, { status: 201 })
      : Response.json({ renders: [done], maxRenders: 1 }),
});
const [result] = await renderMatchMap(ordr, {
  replays: [{ label: "p1", replay: new Uint8Array([1]) }],
  render: { skin: 1, resolution: "960x540" },
});
assert.equal(result.ok, true);
assert.equal(result.videoUrl, "https://v.test/7");
await assert.rejects(
  createOrdrClient({
    fetch: async () => Response.json({ errorCode: 13 }, { status: 400 }),
  }).createRender({ replayUrl: "https://x.test", skin: 1, resolution: "960x540" }),
  OrdrError,
);
console.log("smoke: ok");
