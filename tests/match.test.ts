/**
 * @file tests/match.test.ts
 * @desc renderMatchMap: one render per player, retries for passing refusals, partial failures.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { expect, it, vi } from "vitest";
import { createOrdrClient, renderMatchMap } from "../src/index.js";
import { page, render, stubFetch } from "./helpers/stub.js";

const settings = { skin: "default", resolution: "1280x720" } as const;

it("renders every replay and keeps the order given", async () => {
  let next = 10;
  const ordr = createOrdrClient({
    fetch: stubFetch({
      "POST /ordr/renders": () => Response.json({ renderID: next++ }, { status: 201 }),
      "GET /ordr/renders": (url) => {
        const id = Number(url.searchParams.get("renderID"));
        return id === 11
          ? page(render({ renderID: id, errorCode: 21 }))
          : page(render({ renderID: id, progress: "Done.", videoUrl: `https://v.test/${id}` }));
      },
    }).fetch,
  });
  const onUpdate = vi.fn();
  const results = await renderMatchMap(ordr, {
    replays: [
      { label: "red", replay: new Uint8Array([1]) },
      { label: "blue", replayUrl: "https://x.test/b.osr" },
    ],
    render: settings,
    submitGapMs: 1,
    onUpdate,
  });
  expect(results[0]).toMatchObject({ label: "red", ok: true, videoUrl: "https://v.test/10" });
  expect(results[1]).toMatchObject({ label: "blue", ok: false, renderId: 11 });
  expect(onUpdate).toHaveBeenCalledWith({ label: "red", renderId: 10, progress: "Done." });
});

it("retries passing refusals and gives up on the rest", async () => {
  const answers = [
    Response.json({ errorCode: 40 }, { status: 403, headers: { "retry-after": "0" } }),
    Response.json({ renderID: 1 }, { status: 201 }),
    Response.json({ errorCode: 13 }, { status: 400 }),
  ];
  const ordr = createOrdrClient({
    fetch: stubFetch({
      "POST /ordr/renders": () => answers.shift() as Response,
      "GET /ordr/renders": () => page(render({ progress: "Rendering... (40%)" })),
    }).fetch,
  });
  const onUpdate = vi.fn();
  const results = await renderMatchMap(ordr, {
    replays: [
      { label: "a", replayUrl: "https://x.test/a" },
      { label: "b", replayUrl: "https://x.test/b" },
    ],
    render: settings,
    submitGapMs: 0,
    wait: { intervalMs: 5, timeoutMs: 1 },
    onUpdate,
  });
  expect(results[0]).toMatchObject({ ok: false, renderId: 1 });
  expect(results[1]).toMatchObject({ ok: false, renderId: null });
  expect(onUpdate).toHaveBeenCalledWith({ label: "b", renderId: null, progress: "Refused." });
  expect(onUpdate).toHaveBeenCalledWith({
    label: "a",
    renderId: 1,
    progress: "Rendering... (40%)",
  });
});

it("refuses bad input and rejects on abort", async () => {
  const ordr = createOrdrClient({
    fetch: stubFetch({
      "POST /ordr/renders": () => Response.json({ errorCode: 40 }, { status: 403 }),
      "GET /ordr/renders": () => page(render()),
    }).fetch,
  });
  await expect(renderMatchMap(ordr, { replays: [], render: settings })).rejects.toThrow(RangeError);
  await expect(
    renderMatchMap(ordr, {
      replays: [
        { label: "x", replayUrl: "https://x.test/a" },
        { label: "x", replayUrl: "https://x.test/b" },
      ],
      render: settings,
    }),
  ).rejects.toThrow(RangeError);

  const stopped = new AbortController();
  stopped.abort(new Error("stop"));
  await expect(
    renderMatchMap(ordr, {
      replays: [
        { label: "a", replayUrl: "https://x.test/a" },
        { label: "b", replayUrl: "https://x.test/b" },
      ],
      render: settings,
      signal: stopped.signal,
    }),
  ).rejects.toThrow("stop");

  const midway = new AbortController();
  const pending = renderMatchMap(ordr, {
    replays: [{ label: "a", replayUrl: "https://x.test/a" }],
    render: settings,
    signal: midway.signal,
  });
  setTimeout(() => midway.abort(new Error("later")), 5);
  await expect(pending).rejects.toThrow("later");

  let next = 1;
  const queued = createOrdrClient({
    fetch: stubFetch({
      "POST /ordr/renders": () => Response.json({ renderID: next++ }, { status: 201 }),
      "GET /ordr/renders": () => page(render()),
    }).fetch,
  });
  const waiting = new AbortController();
  const both = renderMatchMap(queued, {
    replays: [{ label: "a", replayUrl: "https://x.test/a" }],
    render: settings,
    wait: { intervalMs: 1000 },
    signal: waiting.signal,
  });
  setTimeout(() => waiting.abort(new Error("waiting")), 5);
  await expect(both).rejects.toThrow("waiting");
});
