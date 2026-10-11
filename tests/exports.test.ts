/**
 * @file tests/exports.test.ts
 * @desc Pins the package's runtime exports and the error-code table's coverage.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

import { expect, it } from "vitest";
import * as api from "../src/index.js";

it("exports", () => {
  expect(Object.keys(api).sort()).toMatchInlineSnapshot(`
    [
      "ORDR_BASE_URL",
      "ORDR_DEV_KEYS",
      "ORDR_ERROR_CODES",
      "ORDR_POLL_INTERVAL_MS",
      "ORDR_TIMEOUT_MS",
      "ORDR_WAIT_TIMEOUT_MS",
      "OrdrError",
      "createOrdrClient",
      "isRetryableOrdrCode",
      "renderMatchMap",
    ]
  `);
});

it("knows every documented o!rdr error code", () => {
  for (let code = 1; code <= 54; code++) expect(api.ORDR_ERROR_CODES[code]).toBeTypeOf("string");
  expect(api.isRetryableOrdrCode(40)).toBe(true);
  expect(api.isRetryableOrdrCode(13)).toBe(false);
});
