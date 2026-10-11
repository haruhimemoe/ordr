/**
 * @file src/schemas.ts
 * @desc zod schemas for o!rdr's JSON answers (internal). Loose objects: o!rdr adds fields often,
 *       and only the ones read here are checked.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { z } from "zod";

export const renderSchema = z.looseObject({
  renderID: z.number().int(),
  date: z.string(),
  username: z.string(),
  progress: z.string(),
  errorCode: z.number().int(),
  removed: z.boolean(),
  renderer: z.string().nullish(),
  description: z.string().nullish(),
  title: z.string().nullish(),
  videoUrl: z.string().nullish(),
  replayUsername: z.string().nullish(),
  replayMods: z.string().nullish(),
  mapID: z.number().int().nullish(),
  mapTitle: z.string().nullish(),
  replayDifficulty: z.string().nullish(),
  mapLength: z.number().nullish(),
  resolution: z.string().nullish(),
  skin: z.string().nullish(),
  isBot: z.boolean().nullish(),
});

export const rendersPageSchema = z.looseObject({
  renders: z.array(renderSchema),
  maxRenders: z.number().int(),
});

export const createdSchema = z.looseObject({
  message: z.string().nullish(),
  renderID: z.number().int(),
});

export const errorBodySchema = z.looseObject({
  message: z.string().nullish(),
  reason: z.string().nullish(),
  errorCode: z.number().int().nullish(),
});

export const skinSchema = z.looseObject({
  id: z.number().int(),
  skin: z.string(),
  presentationName: z.string(),
  url: z.string().nullish(),
  highResPreview: z.string().nullish(),
  lowResPreview: z.string().nullish(),
  gridPreview: z.string().nullish(),
});

export const skinsPageSchema = z.looseObject({
  skins: z.array(skinSchema),
  maxSkins: z.number().int(),
});

export const customSkinSchema = z.looseObject({
  found: z.boolean(),
  removed: z.boolean().nullish(),
  skinName: z.string().nullish(),
  skinAuthor: z.string().nullish(),
  downloadLink: z.string().nullish(),
});

export const dynlinkSchema = z.looseObject({ url: z.string() });

export const presetSchema = z.looseObject({ presetName: z.string() });
