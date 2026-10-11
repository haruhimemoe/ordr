/**
 * @file tests/client.test.ts
 * @desc createOrdrClient: render requests, errors, polling, and the read endpoints.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { describe, expect, it, vi } from "vitest";
import { createOrdrClient, ORDR_DEV_KEYS, OrdrError } from "../src/index.js";
import { page, render, stubFetch } from "./helpers/stub.js";

const created = () =>
  Response.json({ message: "Render added successfully", renderID: 95 }, { status: 201 });

describe("createRender", () => {
  it("sends the replay, key and settings as strings", async () => {
    const { fetch, calls } = stubFetch({ "POST /ordr/renders": created });
    const ordr = createOrdrClient({ fetch, apiKey: ORDR_DEV_KEYS.success, userAgent: "t/1" });
    const result = await ordr.createRender({
      replay: new Uint8Array([1, 2, 3]),
      skin: 3,
      resolution: "1280x720",
      showScoreboard: false,
      cursorSize: 1.5,
    });
    expect(result).toEqual({ renderId: 95 });
    const form = calls[0]?.body;
    expect(form?.get("verificationKey")).toBe("devmode_success");
    expect(form?.get("skin")).toBe("3");
    expect(form?.get("showScoreboard")).toBe("false");
    expect(form?.get("cursorSize")).toBe("1.5");
    expect(form?.has("visibility")).toBe(false);
    const file = form?.get("replayFile") as File;
    expect(file.name).toBe("replay.osr");
    expect(file.size).toBe(3);
  });

  it("sends replayURL, a Blob as-is, and no key when none is set", async () => {
    const { fetch, calls } = stubFetch({ "POST /ordr/renders": created });
    const ordr = createOrdrClient({ fetch });
    await ordr.createRender({
      replayUrl: "https://x.test/a.osr",
      skin: "a",
      resolution: "960x540",
    });
    expect(calls[0]?.body?.get("replayURL")).toBe("https://x.test/a.osr");
    expect(calls[0]?.body?.has("verificationKey")).toBe(false);
    await ordr.createRender({
      replay: new Blob(["ab"]),
      filename: "m.osr",
      skin: "a",
      resolution: "960x540",
    });
    expect((calls[1]?.body?.get("replayFile") as File | undefined)?.name).toBe("m.osr");
  });

  it("refuses bad arguments before any request", async () => {
    const { fetch, calls } = stubFetch({});
    const ordr = createOrdrClient({ fetch });
    await expect(
      ordr.createRender({ replayUrl: "nope", skin: 1, resolution: "960x540" }),
    ).rejects.toThrow(RangeError);
    await expect(
      ordr.createRender({
        replayUrl: "https://x.test",
        skin: 1,
        resolution: "960x540",
        cursorSize: Number.NaN,
      }),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });

  it("turns refusals into OrdrErrors with o!rdr's code", async () => {
    const ordr = createOrdrClient({
      fetch: stubFetch({
        "POST /ordr/renders": () => Response.json({ message: "x", errorCode: 13 }, { status: 400 }),
      }).fetch,
    });
    const error = await ordr
      .createRender({ replayUrl: "https://x.test", skin: 1, resolution: "960x540" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OrdrError);
    expect(error).toMatchObject({
      code: "rejected",
      ordrCode: 13,
      status: 400,
      retryable: false,
      message: "The beatmap is longer than 15 minutes.",
    });
  });

  it("marks 429s, 5xx and passing refusals retryable", async () => {
    const answers = [
      new Response("slow down", { status: 429, headers: { "retry-after": "7" } }),
      Response.json({ reason: "busy", errorCode: 0 }, { status: 503 }),
      Response.json({ errorCode: 40 }, { status: 403 }),
      Response.json({ errorCode: 999, message: "new" }, { status: 400 }),
    ];
    const ordr = createOrdrClient({
      fetch: stubFetch({ "POST /ordr/renders": () => answers.shift() as Response }).fetch,
    });
    const send = () =>
      ordr
        .createRender({ replayUrl: "https://x.test", skin: 1, resolution: "960x540" })
        .catch((e: OrdrError) => e);
    expect(await send()).toMatchObject({ code: "http_error", retryable: true, retryAfterMs: 7000 });
    expect(await send()).toMatchObject({ code: "http_error", retryable: true, message: "busy" });
    expect(await send()).toMatchObject({ code: "rejected", ordrCode: 40, retryable: true });
    expect(await send()).toMatchObject({ code: "rejected", ordrCode: 999, message: "new" });
  });
});

describe("requests", () => {
  it("reports network failures, timeouts, bad JSON and aborts", async () => {
    const down = createOrdrClient({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(down.listRenders()).rejects.toMatchObject({ code: "network", retryable: true });

    const hang = createOrdrClient({
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    });
    await expect(hang.listRenders()).rejects.toMatchObject({ code: "timeout" });
    const controller = new AbortController();
    const pending = hang.listRenders({ signal: controller.signal });
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toThrow("stop");

    const junk = createOrdrClient({ fetch: async () => new Response("<html>") });
    await expect(junk.listRenders()).rejects.toMatchObject({ code: "bad_response", status: 200 });
  });

  it("validates options", () => {
    expect(() => createOrdrClient({ baseUrl: "ftp://x" })).toThrow(RangeError);
    expect(() => createOrdrClient({ baseUrl: "https://x/?a" })).toThrow(RangeError);
    expect(() => createOrdrClient({ timeoutMs: 0 })).toThrow(RangeError);
    expect(() => createOrdrClient({ baseUrl: "https://x/api/" })).not.toThrow();
  });
});

describe("reading", () => {
  it("lists renders with filters and finds one by id", async () => {
    const { fetch, calls } = stubFetch({
      "GET /ordr/renders": (url) =>
        url.searchParams.get("renderID") === "404" ? page() : page(render()),
    });
    const ordr = createOrdrClient({ fetch });
    const list = await ordr.listRenders({
      page: 2,
      pageSize: 5,
      renderId: 1,
      beatmapsetId: 9,
      link: "pov8n",
      noBots: true,
    });
    expect(list.total).toBe(1);
    expect(calls[0]?.url.search).toBe(
      "?page=2&pageSize=5&renderID=1&beatmapsetid=9&link=pov8n&nobots=true",
    );
    expect((await ordr.getRender(1))?.renderID).toBe(1);
    expect(await ordr.getRender(404)).toBeNull();
    await expect(ordr.getRender(0)).rejects.toThrow(RangeError);
  });

  it("reads skins, custom skins, download links and presets", async () => {
    const { fetch, calls } = stubFetch({
      "GET /ordr/skins": () =>
        Response.json({ skins: [{ id: 1, skin: "a", presentationName: "A" }], maxSkins: 1 }),
      "GET /ordr/skins/custom": (url) =>
        url.searchParams.get("id") === "1"
          ? Response.json({ found: true, removed: false, skinName: "S", skinAuthor: "me" })
          : url.searchParams.get("id") === "2"
            ? Response.json({ found: true, removed: true })
            : url.searchParams.get("id") === "3"
              ? Response.json({ found: false })
              : url.searchParams.get("id") === "404"
                ? new Response("{}", { status: 404 })
                : new Response("{}", { status: 500 }),
      "GET /dynlink/ordr/gen": () => Response.json({ url: "https://dl.test/v.mp4" }),
      "GET /ordr/presets/bot": (url) =>
        url.searchParams.get("discord_id") === "1"
          ? Response.json({ presetName: "mine", lastSavedOn: "x" })
          : url.searchParams.get("discord_id") === "2"
            ? new Response("{}", { status: 404 })
            : new Response("{}", { status: 500 }),
    });
    const ordr = createOrdrClient({ fetch, apiKey: "k" });
    expect(await ordr.listSkins({ page: 1, pageSize: 2, search: "white" })).toMatchObject({
      total: 1,
    });
    expect(calls[0]?.url.search).toBe("?page=1&pageSize=2&search=white");
    expect(await ordr.getCustomSkin(1)).toEqual({ name: "S", author: "me", downloadLink: null });
    expect(await ordr.getCustomSkin(2)).toBeNull();
    expect(await ordr.getCustomSkin(3)).toBeNull();
    expect(await ordr.getCustomSkin(404)).toBeNull();
    await expect(ordr.getCustomSkin(5)).rejects.toMatchObject({ status: 500 });
    expect(await ordr.downloadLink(1)).toBe("https://dl.test/v.mp4");
    expect(await ordr.getBotPreset("1")).toMatchObject({ presetName: "mine" });
    expect(await ordr.getBotPreset("2")).toBeNull();
    await expect(ordr.getBotPreset("3")).rejects.toMatchObject({ status: 500 });
    await expect(ordr.getBotPreset("x")).rejects.toThrow(RangeError);
    await expect(createOrdrClient({ fetch }).getBotPreset("1")).rejects.toThrow(RangeError);
  });
});

describe("waitForRender", () => {
  it("polls until done and reports each new progress once", async () => {
    vi.useFakeTimers();
    const states = [
      page(),
      page(render({ progress: "In queue..." })),
      page(render({ progress: "In queue..." })),
      page(render({ progress: "Done.", videoUrl: "https://link.test/v" })),
    ];
    const ordr = createOrdrClient({
      fetch: stubFetch({ "GET /ordr/renders": () => states.shift() as Response }).fetch,
    });
    const onProgress = vi.fn();
    const done = ordr.waitForRender(1, { intervalMs: 10, onProgress });
    await vi.runAllTimersAsync();
    expect(await done).toMatchObject({ renderId: 1, videoUrl: "https://link.test/v" });
    expect(onProgress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("rejects on failure, removal, timeout and abort", async () => {
    const answer = { current: render() };
    const ordr = createOrdrClient({
      fetch: stubFetch({ "GET /ordr/renders": () => page(answer.current) }).fetch,
    });
    answer.current = render({ errorCode: 27 });
    await expect(ordr.waitForRender(1)).rejects.toMatchObject({
      code: "render_failed",
      ordrCode: 27,
      retryable: true,
      renderId: 1,
    });
    answer.current = render({ errorCode: 777 });
    await expect(ordr.waitForRender(1)).rejects.toThrow("Render 1 failed (777).");
    answer.current = render({ removed: true });
    await expect(ordr.waitForRender(1)).rejects.toMatchObject({ code: "render_removed" });
    answer.current = render();
    await expect(ordr.waitForRender(1, { intervalMs: 50, timeoutMs: 10 })).rejects.toMatchObject({
      code: "timeout",
    });
    const controller = new AbortController();
    const pending = ordr.waitForRender(1, { intervalMs: 1000, signal: controller.signal });
    setTimeout(() => controller.abort(new Error("stop")), 5);
    await expect(pending).rejects.toThrow("stop");
    controller.signal.throwIfAborted = () => {};
    await expect(
      ordr.waitForRender(1, { intervalMs: 1, signal: controller.signal }),
    ).rejects.toThrow("stop");
    await expect(ordr.waitForRender(-1)).rejects.toThrow(RangeError);
  });
});
