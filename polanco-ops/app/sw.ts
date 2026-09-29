import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// Same list as PROTECTED_PATHS in proxy.ts (the worker is a separate bundle,
// so it can't import from there). Keep the two in sync.
const PRIVATE_PATHS = ["/dashboard", "/inventory", "/leads", "/deals", "/settings"];

// defaultCache caches /api GETs, every cross-origin GET (which includes the
// browser's Supabase REST calls — lead names, phones, deals) and the HTML/RSC
// of every page visited, keyed by URL alone. On a shared phone that data
// outlives the session. These rules run first and send private traffic
// straight to the network so it is never written to Cache Storage.
const privateNetworkOnly: RuntimeCaching[] = [
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    // Public car photos stay cacheable; everything else on Supabase is private.
    matcher: ({ url }) =>
      url.hostname.endsWith(".supabase.co") &&
      !url.pathname.startsWith("/storage/v1/object/public/"),
    handler: new NetworkOnly(),
  },
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && PRIVATE_PATHS.some((p) => url.pathname.startsWith(p)),
    handler: new NetworkOnly(),
  },
];

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...privateNetworkOnly, ...defaultCache],
});

serwist.addEventListeners();
