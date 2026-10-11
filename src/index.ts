/**
 * @file src/index.ts
 * @desc @haruhimemoe/ordr: the o!rdr replay renderer client and match-map rendering.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

export {
  createOrdrClient,
  ORDR_BASE_URL,
  ORDR_DEV_KEYS,
  ORDR_POLL_INTERVAL_MS,
  ORDR_TIMEOUT_MS,
  ORDR_WAIT_TIMEOUT_MS,
  type OrdrClient,
} from "./client.js";
export { isRetryableOrdrCode, ORDR_ERROR_CODES, OrdrError, type OrdrErrorCode } from "./errors.js";
export {
  type MatchMapOptions,
  type MatchRenderResult,
  type MatchReplay,
  renderMatchMap,
} from "./match.js";
export type * from "./types.js";
