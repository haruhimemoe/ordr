/**
 * @file tests/helpers/stub.ts
 * @desc A stub fetch that routes by method and path, records every call, and a Render factory.
 * @author David @dvhsh (https://dvh.sh)
 * @created Sat Oct 10, 2026
 * @modified Sat Oct 10, 2026
 */

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

export const stubFetch = (routes: Record<string, Route>) => {
  const calls: { method: string; url: URL; body: FormData | null }[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body instanceof FormData ? init.body : null });
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response("{}", { status: 404 });
    return route(url, init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
};

export const render = (overrides: Record<string, unknown> = {}) => ({
  renderID: 1,
  date: "2026-10-10T00:00:00.000Z",
  username: "harumin",
  progress: "In queue...",
  errorCode: 0,
  removed: false,
  videoUrl: null,
  ...overrides,
});

export const page = (...renders: ReturnType<typeof render>[]) =>
  Response.json({ renders, maxRenders: renders.length });
