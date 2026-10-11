/**
 * @file src/types.ts
 * @desc Option and result types for the o!rdr client.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import type { z } from "zod";
import type { renderSchema, skinSchema } from "./schemas.js";

/** A render as o!rdr lists it. Extra fields o!rdr sends are kept. */
export type Render = z.infer<typeof renderSchema>;
/** A built-in skin. */
export type Skin = z.infer<typeof skinSchema>;

/** 960x540 and 1280x720 for every key; 1920x1080 and 3840x2160 need o!rdr's permission. */
export type Resolution = "960x540" | "1280x720" | "1920x1080" | "3840x2160";
/** UNLISTED and PRIVATE need o!rdr's permission. */
export type Visibility = "PUBLIC" | "UNLISTED" | "PRIVATE";

/** danser settings. Anything left out takes o!rdr's default (see the README). */
export interface RenderSettings {
  globalVolume?: number;
  musicVolume?: number;
  hitsoundVolume?: number;
  showHitErrorMeter?: boolean;
  showUnstableRate?: boolean;
  showScore?: boolean;
  showHPBar?: boolean;
  showComboCounter?: boolean;
  showPPCounter?: boolean;
  showScoreboard?: boolean;
  showBorders?: boolean;
  showMods?: boolean;
  showResultScreen?: boolean;
  showAimErrorMeter?: boolean;
  showHitCounter?: boolean;
  showKeyOverlay?: boolean;
  showStrainGraph?: boolean;
  showSliderBreaks?: boolean;
  showAvatarsOnScoreboard?: boolean;
  showDanserLogo?: boolean;
  useSkinCursor?: boolean;
  useSkinColors?: boolean;
  useSkinHitsounds?: boolean;
  useBeatmapColors?: boolean;
  loadStoryboard?: boolean;
  loadVideo?: boolean;
  introBGDim?: number;
  inGameBGDim?: number;
  breakBGDim?: number;
  skip?: boolean;
  cursorSize?: number;
  cursorTrail?: boolean;
  sliderSnakingIn?: boolean;
  sliderSnakingOut?: boolean;
  playNightcoreSamples?: boolean;
  ignoreFail?: boolean;
}

/** Where the replay comes from: the .osr bytes, or a URL o!rdr downloads it from. */
export type ReplaySource = { replay: Blob | Uint8Array; filename?: string } | { replayUrl: string };

/** One render request. */
export type RenderRequest = ReplaySource &
  RenderSettings & {
    /** A built-in skin's name or id, or a custom skin id with customSkin. */
    skin: string | number;
    customSkin?: boolean;
    resolution: Resolution;
    visibility?: Visibility;
    /** For PRIVATE renders: false skips the (always public) thumbnail. */
    generateThumbnail?: boolean;
    /** The requester's Discord id, for verified bots: per-user rate limits and presets. */
    discordUserId?: string;
    /** With discordUserId: false keeps the user's saved preset from overriding these settings. */
    usePreset?: boolean;
    signal?: AbortSignal;
  };

/** Filters for listRenders. */
export interface RenderQuery {
  page?: number;
  pageSize?: number;
  renderId?: number;
  beatmapsetId?: number;
  /** A link.issou.best shortlink path, e.g. "pov8n". */
  link?: string;
  noBots?: boolean;
  signal?: AbortSignal;
}

/** A finished render. */
export interface FinishedRender {
  renderId: number;
  /** o!rdr's video link (a link.issou.best shortlink). */
  videoUrl: string;
  render: Render;
}

/** Progress while a render is queued or running. */
export interface RenderProgress {
  renderId: number;
  /** o!rdr's own words, e.g. "In queue..." or "Rendering... (42%)". */
  progress: string;
  render: Render;
}

/** Options for waitForRender. */
export interface WaitOptions {
  /** How often to ask o!rdr. Default ORDR_POLL_INTERVAL_MS (5 s). */
  intervalMs?: number;
  /** When to give up with a "timeout" OrdrError. Default ORDR_WAIT_TIMEOUT_MS (30 min). */
  timeoutMs?: number;
  onProgress?: (progress: RenderProgress) => void;
  signal?: AbortSignal;
}

/** Options for createOrdrClient. */
export interface OrdrClientOptions {
  /** Your o!rdr key (verificationKey), or a devmode_* key while testing. Keep it server-side. */
  apiKey?: string;
  /** Default ORDR_BASE_URL. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Sent as User-Agent. Name your tool. */
  userAgent?: string;
  /** Per request, until the whole answer is read. Default ORDR_TIMEOUT_MS (30 s). */
  timeoutMs?: number;
}
