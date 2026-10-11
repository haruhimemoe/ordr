/**
 * @file src/client.ts
 * @desc Client for the o!rdr replay renderer (ordr.issou.best): queue renders from .osr bytes or
 *       a replay URL, poll them until done, and read renders, skins, custom skins, download links
 *       and bot presets. Server-side: the API key must stay secret. Progress comes from polling
 *       GET /ordr/renders, so there's no socket.io dependency; apps that want push events can
 *       connect to o!rdr's websocket themselves.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import type { z } from "zod";
import { isRetryableOrdrCode, ORDR_ERROR_CODES, OrdrError } from "./errors.js";
import {
  createdSchema,
  customSkinSchema,
  dynlinkSchema,
  errorBodySchema,
  presetSchema,
  rendersPageSchema,
  skinsPageSchema,
} from "./schemas.js";
import type {
  FinishedRender,
  OrdrClientOptions,
  Render,
  RenderQuery,
  RenderRequest,
  Skin,
  WaitOptions,
} from "./types.js";

/** Default baseUrl: o!rdr's API. */
export const ORDR_BASE_URL = "https://apis.issou.best";
/** Default time one request may take. */
export const ORDR_TIMEOUT_MS = 30_000;
/** Default gap between waitForRender's checks. */
export const ORDR_POLL_INTERVAL_MS = 5_000;
/** Default time waitForRender waits before giving up. */
export const ORDR_WAIT_TIMEOUT_MS = 30 * 60_000;
/** o!rdr's dev-mode keys: simulated renders, nothing is rendered. */
export const ORDR_DEV_KEYS = Object.freeze({
  success: "devmode_success",
  fail: "devmode_fail",
  wsFail: "devmode_wsfail",
});

const NETWORK_MESSAGE = "Couldn't reach o!rdr. Check your connection and try again.";
/** The form fields that aren't settings, handled on their own. */
const SPECIAL_FIELDS = new Set(["replay", "filename", "replayUrl", "signal"]);

const isId = (id: number): boolean => Number.isSafeInteger(id) && id > 0;
const checkId = (id: number, name: string): void => {
  if (!isId(id)) throw new RangeError(`${name} must be a positive integer.`);
};

const parseRetryAfter = (header: string | null): number | null =>
  header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) * 1000 : null;

const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** A Render's state: done with a video, failed with o!rdr's code, or still going. */
const settled = (render: Render): FinishedRender | OrdrError | null => {
  const renderId = render.renderID;
  if (render.removed) {
    return new OrdrError("render_removed", `Render ${renderId} was removed.`, { renderId });
  }
  if (render.errorCode > 0) {
    return new OrdrError(
      "render_failed",
      ORDR_ERROR_CODES[render.errorCode] ?? `Render ${renderId} failed (${render.errorCode}).`,
      { renderId, ordrCode: render.errorCode, retryable: isRetryableOrdrCode(render.errorCode) },
    );
  }
  if (render.videoUrl && /^done/i.test(render.progress)) {
    return { renderId, videoUrl: render.videoUrl, render };
  }
  return null;
};

/**
 * @function createOrdrClient
 * @param options {OrdrClientOptions} key, base URL, fetch, User-Agent, timeout
 * @returns {OrdrClient} the client
 * @throws {RangeError} when baseUrl isn't an absolute http(s) URL or timeoutMs isn't positive
 */
export const createOrdrClient = (options: OrdrClientOptions = {}) => {
  const baseUrl = (options.baseUrl ?? ORDR_BASE_URL).replace(/\/+$/, "");
  if (!/^https?:\/\/[^/?#]+(\/[^?#]*)?$/.test(baseUrl)) {
    throw new RangeError("baseUrl must be an absolute http(s) URL, with no query or hash.");
  }
  const timeoutMs = options.timeoutMs ?? ORDR_TIMEOUT_MS;
  if (!(timeoutMs > 0)) throw new RangeError("timeoutMs must be positive.");
  const doFetch = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = options.userAgent
    ? { "user-agent": options.userAgent }
    : {};

  const request = async <T>(
    path: string,
    schema: z.ZodType<T>,
    init: { method?: string; body?: FormData; signal?: AbortSignal | undefined } = {},
  ): Promise<T> => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    let text: string;
    try {
      response = await doFetch(`${baseUrl}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body ?? null,
        signal,
      });
      text = await response.text();
    } catch (error) {
      if (init.signal?.aborted) throw init.signal.reason;
      if (timeout.aborted) {
        throw new OrdrError("timeout", "o!rdr took too long to answer.", {
          retryable: true,
          cause: error,
        });
      }
      throw new OrdrError("network", NETWORK_MESSAGE, { retryable: true, cause: error });
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const status = response.status;
    if (!response.ok) {
      const body = errorBodySchema.safeParse(json);
      const ordrCode = body.success ? (body.data.errorCode ?? null) : null;
      const said = body.success ? (body.data.reason ?? body.data.message) : null;
      const message =
        (ordrCode !== null ? ORDR_ERROR_CODES[ordrCode] : undefined) ??
        said ??
        `o!rdr answered ${status}.`;
      throw new OrdrError(ordrCode !== null && ordrCode > 0 ? "rejected" : "http_error", message, {
        status,
        ordrCode,
        retryable:
          status === 429 || status >= 500 || (ordrCode !== null && isRetryableOrdrCode(ordrCode)),
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new OrdrError("bad_response", "o!rdr sent an answer this client can't read.", {
        status,
        cause: parsed.error,
      });
    }
    return parsed.data;
  };

  const getRender = async (renderId: number, signal?: AbortSignal): Promise<Render | null> => {
    checkId(renderId, "renderId");
    const page = await request(`/ordr/renders?renderID=${renderId}`, rendersPageSchema, { signal });
    return page.renders.find((render) => render.renderID === renderId) ?? null;
  };

  return {
    /**
     * Queues a render. Resolves with its id once o!rdr accepts it; use waitForRender for the
     * video. Refusals are OrdrErrors with code "rejected" and o!rdr's ordrCode.
     */
    createRender: async (input: RenderRequest): Promise<{ renderId: number }> => {
      const form = new FormData();
      if ("replayUrl" in input) {
        if (!URL.canParse(input.replayUrl)) throw new RangeError("replayUrl must be a URL.");
        form.set("replayURL", input.replayUrl);
      } else {
        const blob =
          input.replay instanceof Blob ? input.replay : new Blob([new Uint8Array(input.replay)]);
        form.set("replayFile", blob, input.filename ?? "replay.osr");
      }
      if (options.apiKey) form.set("verificationKey", options.apiKey);
      for (const [key, value] of Object.entries(input)) {
        if (SPECIAL_FIELDS.has(key) || value === undefined) continue;
        if (typeof value === "number" && !Number.isFinite(value)) {
          throw new RangeError(`${key} must be a finite number.`);
        }
        form.set(key, String(value));
      }
      const created = await request("/ordr/renders", createdSchema, {
        method: "POST",
        body: form,
        signal: input.signal,
      });
      return { renderId: created.renderID };
    },

    /** One render by id, or null when o!rdr doesn't list it. */
    getRender,

    /** A page of renders, newest first. */
    listRenders: async (query: RenderQuery = {}): Promise<{ renders: Render[]; total: number }> => {
      const params = new URLSearchParams();
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
      if (query.renderId !== undefined) params.set("renderID", String(query.renderId));
      if (query.beatmapsetId !== undefined) {
        params.set("beatmapsetid", String(query.beatmapsetId));
      }
      if (query.link !== undefined) params.set("link", query.link);
      if (query.noBots) params.set("nobots", "true");
      const page = await request(`/ordr/renders?${params}`, rendersPageSchema, {
        signal: query.signal,
      });
      return { renders: page.renders, total: page.maxRenders };
    },

    /**
     * Polls a render until it has a video. Rejects with an OrdrError: "render_failed" (with
     * o!rdr's ordrCode), "render_removed", or "timeout" after options.timeoutMs.
     */
    waitForRender: async (renderId: number, wait: WaitOptions = {}): Promise<FinishedRender> => {
      checkId(renderId, "renderId");
      const intervalMs = wait.intervalMs ?? ORDR_POLL_INTERVAL_MS;
      const deadline = Date.now() + (wait.timeoutMs ?? ORDR_WAIT_TIMEOUT_MS);
      let last = "";
      for (;;) {
        const render = await getRender(renderId, wait.signal);
        if (render) {
          const state = settled(render);
          if (state instanceof OrdrError) throw state;
          if (state) return state;
          if (render.progress !== last) {
            last = render.progress;
            wait.onProgress?.({ renderId, progress: render.progress, render });
          }
        }
        if (Date.now() + intervalMs > deadline) {
          throw new OrdrError("timeout", `Render ${renderId} didn't finish in time.`, {
            renderId,
            retryable: true,
          });
        }
        await sleep(intervalMs, wait.signal);
      }
    },

    /** A temporary direct .mp4 link for a finished render (for bots that download videos). */
    downloadLink: async (renderId: number, signal?: AbortSignal): Promise<string> => {
      checkId(renderId, "renderId");
      return (await request(`/dynlink/ordr/gen?id=${renderId}`, dynlinkSchema, { signal })).url;
    },

    /** A page of o!rdr's built-in skins, optionally searched. */
    listSkins: async (
      query: { page?: number; pageSize?: number; search?: string; signal?: AbortSignal } = {},
    ): Promise<{ skins: Skin[]; total: number }> => {
      const params = new URLSearchParams();
      if (query.page !== undefined) params.set("page", String(query.page));
      if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
      if (query.search !== undefined) params.set("search", query.search);
      const page = await request(`/ordr/skins?${params}`, skinsPageSchema, {
        signal: query.signal,
      });
      return { skins: page.skins, total: page.maxSkins };
    },

    /** A custom skin, or null when it doesn't exist or was deleted. */
    getCustomSkin: async (
      skinId: number,
      signal?: AbortSignal,
    ): Promise<{ name: string; author: string | null; downloadLink: string | null } | null> => {
      checkId(skinId, "skinId");
      try {
        const skin = await request(`/ordr/skins/custom?id=${skinId}`, customSkinSchema, {
          signal,
        });
        if (!skin.found || skin.removed) return null;
        return {
          name: skin.skinName ?? "",
          author: skin.skinAuthor ?? null,
          downloadLink: skin.downloadLink ?? null,
        };
      } catch (error) {
        if (error instanceof OrdrError && error.status === 404) return null;
        throw error;
      }
    },

    /**
     * A Discord user's o!rdr preset set to "used with bots", or null. Needs a verified bot key.
     * o!rdr applies it by itself when createRender gets discordUserId; this is for showing it.
     */
    getBotPreset: async (
      discordUserId: string,
      signal?: AbortSignal,
    ): Promise<z.infer<typeof presetSchema> | null> => {
      if (!options.apiKey) throw new RangeError("getBotPreset needs an apiKey.");
      if (!/^\d+$/.test(discordUserId)) throw new RangeError("discordUserId must be digits.");
      const params = new URLSearchParams({ key: options.apiKey, discord_id: discordUserId });
      try {
        return await request(`/ordr/presets/bot?${params}`, presetSchema, { signal });
      } catch (error) {
        if (error instanceof OrdrError && error.status === 404) return null;
        throw error;
      }
    },
  };
};

/** The client createOrdrClient returns. */
export type OrdrClient = ReturnType<typeof createOrdrClient>;
