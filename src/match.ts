/**
 * @file src/match.ts
 * @desc renderMatchMap: renders every player's replay of one map from a match (a tourney map
 *       that wasn't streamed, say) and collects the videos. o!rdr renders one replay per video,
 *       so this gives one video per player; stitching them into one (side by side, or a grid) is
 *       the caller's job, e.g. ffmpeg on harumin's server. Without an API key o!rdr allows one
 *       render per 5 minutes, so matches need a key.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import type { OrdrClient } from "./client.js";
import { OrdrError } from "./errors.js";
import type { FinishedRender, RenderRequest, WaitOptions } from "./types.js";

/** One player's replay. `label` is yours: a username, team or slot, echoed back in results. */
export type MatchReplay = { label: string } & (
  | { replay: Blob | Uint8Array; filename?: string }
  | { replayUrl: string }
);

/** What happened to one replay. */
export type MatchRenderResult =
  | ({ label: string; ok: true } & FinishedRender)
  | { label: string; ok: false; renderId: number | null; error: unknown };

/** Options for renderMatchMap. */
export interface MatchMapOptions {
  replays: readonly MatchReplay[];
  /** Skin, resolution, visibility and danser settings shared by every render. */
  render: Omit<RenderRequest, "replay" | "filename" | "replayUrl" | "signal">;
  /** Gap between submissions, to go easy on o!rdr's queue. Default 1 s. */
  submitGapMs?: number;
  /** How many times to resubmit a replay o!rdr refused for a passing reason. Default 2. */
  submitRetries?: number;
  /** Called as each render changes. */
  onUpdate?: (update: { label: string; renderId: number | null; progress: string }) => void;
  wait?: Omit<WaitOptions, "onProgress" | "signal">;
  signal?: AbortSignal;
}

const pause = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * @function renderMatchMap
 * @param client {OrdrClient} an o!rdr client, ideally with an API key
 * @param options {MatchMapOptions} the replays, shared render settings, pacing and callbacks
 * @returns {Promise<MatchRenderResult[]>} one result per replay, in the order given; one player's
 *          failure doesn't stop the others. Rejects only on abort.
 * @throws {RangeError} when there are no replays or two share a label
 */
export const renderMatchMap = async (
  client: OrdrClient,
  options: MatchMapOptions,
): Promise<MatchRenderResult[]> => {
  const { replays, signal } = options;
  if (replays.length === 0) throw new RangeError("replays must not be empty.");
  if (new Set(replays.map((r) => r.label)).size !== replays.length) {
    throw new RangeError("Every replay needs its own label.");
  }
  const gap = options.submitGapMs ?? 1000;
  const retries = options.submitRetries ?? 2;
  const waits: Promise<MatchRenderResult>[] = [];

  for (const [index, { label, ...source }] of replays.entries()) {
    if (index > 0) await pause(gap, signal);
    let renderId: number | null = null;
    let failure: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        ({ renderId } = await client.createRender({
          ...options.render,
          ...source,
          ...(signal ? { signal } : {}),
        }));
        break;
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        failure = error;
        if (!(error instanceof OrdrError && error.retryable) || attempt === retries) break;
        await pause(error.retryAfterMs ?? 10_000 * (attempt + 1), signal);
      }
    }
    if (renderId === null) {
      options.onUpdate?.({ label, renderId: null, progress: "Refused." });
      waits.push(Promise.resolve({ label, ok: false, renderId: null, error: failure }));
      continue;
    }
    const id = renderId;
    options.onUpdate?.({ label, renderId: id, progress: "Queued." });
    waits.push(
      client
        .waitForRender(id, {
          ...options.wait,
          ...(signal ? { signal } : {}),
          onProgress: ({ progress }) => options.onUpdate?.({ label, renderId: id, progress }),
        })
        .then(
          (done): MatchRenderResult => {
            options.onUpdate?.({ label, renderId: id, progress: "Done." });
            return { label, ok: true, ...done };
          },
          (error: unknown): MatchRenderResult => {
            if (signal?.aborted) throw signal.reason;
            return { label, ok: false, renderId: id, error };
          },
        ),
    );
  }
  return Promise.all(waits);
};
