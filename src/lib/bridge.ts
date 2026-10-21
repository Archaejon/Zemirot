import type { AssistApi } from "./assist";
import type { UpdatesApi } from "./updates";

/**
 * The desktop preload exposes these two small APIs. A plain browser has no
 * bridge at all, which is how feature code knows to fall back to a static view.
 */
declare global {
  interface Window {
    zemirot?: {
      updates?: UpdatesApi;
      assist?: AssistApi;
    };
  }
}

export {};
