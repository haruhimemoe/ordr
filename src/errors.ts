/**
 * @file src/errors.ts
 * @desc OrdrError: every failure the client reports, with the client's own code, o!rdr's numeric
 *       errorCode when it sent one, the HTTP status, and whether trying again can help. Also the
 *       table of o!rdr's error codes (rev24g docs, Sep 28, 2026).
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

/** The client's own codes. */
export type OrdrErrorCode =
  | "network"
  | "timeout"
  | "bad_response"
  | "http_error"
  | "rejected"
  | "render_failed"
  | "render_removed";

/**
 * o!rdr's numeric error codes and what they mean, from its docs. Codes 1-4, 15 and 18-22, 27, 28
 * and 50 arrive after a render was queued (render_failed); the rest refuse the request up front.
 */
export const ORDR_ERROR_CODES: Readonly<Record<number, string>> = Object.freeze({
  1: "The render was stopped by an o!rdr admin.",
  2: "The replay couldn't be read (bad upload).",
  3: "o!rdr couldn't download the replay.",
  4: "Every beatmap mirror o!rdr uses is down.",
  5: "The replay file is corrupted.",
  6: "Only osu!standard replays can be rendered.",
  7: "The replay has no input data.",
  8: "The beatmap isn't on osu! (custom or unsubmitted difficulty).",
  9: "The map's audio is unavailable (copyright).",
  10: "o!rdr couldn't reach the osu! API.",
  11: "The replay uses Autoplay.",
  12: "The replay's username has invalid characters.",
  13: "The beatmap is longer than 15 minutes.",
  14: "This player is banned from o!rdr.",
  15: "No beatmap mirror has this map.",
  16: "This IP is banned from o!rdr.",
  17: "This username is banned from o!rdr.",
  18: "The renderer hit an unknown error.",
  19: "The renderer couldn't download the map.",
  20: "The mirror's version of the map doesn't match the replay.",
  21: "The replay is corrupted (danser can't read it).",
  22: "o!rdr had a problem finishing the video.",
  23: "o!rdr had a problem preparing the render.",
  24: "The beatmap has no name.",
  25: "The replay is missing input data.",
  26: "The replay has incompatible mods.",
  27: "The renderer's connection failed.",
  28: "The renderer couldn't download the replay.",
  29: "This replay is already rendering or queued.",
  30: "The star rating is over 20.",
  31: "The mapper is blacklisted.",
  32: "The beatmapset is blacklisted.",
  33: "This replay already failed less than an hour ago.",
  34: "The replay URL is invalid or couldn't be downloaded.",
  35: "A required field is missing.",
  36: "Too many of your recent replays failed.",
  37: "The replay's username is inappropriate.",
  38: "This skin doesn't exist.",
  39: "This custom skin doesn't exist or was deleted.",
  40: "o!rdr isn't taking renders right now.",
  41: "o!rdr isn't taking renders from unauthenticated users right now.",
  42: "The replay's accuracy is too low for an unauthenticated request.",
  43: "This score doesn't exist.",
  44: "This score's replay isn't available.",
  45: "Invalid osu! ruleset score id.",
  46: "The replay's username is longer than 32 characters.",
  47: "No permission to use motion blur.",
  48: "No permission to render at 1080p.",
  49: "No permission to change the music pitch.",
  50: "The replay's mods aren't supported, or it was tampered with.",
  51: "The beatmap difficulty is blacklisted.",
  52: "No permission to render score ids.",
  53: "The beatmap is too short.",
  54: "This Discord user is rate limited.",
});

/** o!rdr codes where the same request can work later. */
const RETRYABLE_ORDR_CODES = new Set([4, 10, 18, 22, 23, 27, 28, 40, 41, 54]);

/**
 * @function isRetryableOrdrCode
 * @param code {number} o!rdr's errorCode
 * @returns {boolean} true when the same request may work later (outages, renderer trouble)
 */
export const isRetryableOrdrCode = (code: number): boolean => RETRYABLE_ORDR_CODES.has(code);

/**
 * How every o!rdr request fails, except aborts (which reject with the signal's reason) and bad
 * arguments (a RangeError). Branch on `code`, or on `ordrCode` for o!rdr's own reason.
 */
export class OrdrError extends Error {
  /** What went wrong, in the client's terms. */
  readonly code: OrdrErrorCode;
  /** o!rdr's numeric errorCode (see ORDR_ERROR_CODES), when it sent one. */
  readonly ordrCode: number | null;
  /** The HTTP status, or null when no response arrived or the failure came from a render. */
  readonly status: number | null;
  /** Whether trying again can help. */
  readonly retryable: boolean;
  /** How long o!rdr asked us to wait (Retry-After), when it said. */
  readonly retryAfterMs: number | null;
  /** The render this is about, when there is one. */
  readonly renderId: number | null;

  constructor(
    code: OrdrErrorCode,
    message: string,
    options: {
      ordrCode?: number | null | undefined;
      status?: number | null | undefined;
      retryable?: boolean | undefined;
      retryAfterMs?: number | null | undefined;
      renderId?: number | null | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "OrdrError";
    this.code = code;
    this.ordrCode = options.ordrCode ?? null;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.renderId = options.renderId ?? null;
  }
}
