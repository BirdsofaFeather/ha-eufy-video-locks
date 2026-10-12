import { EufyMega, FileSessionStore, LoginStatus } from "@mega-yfue/eufy-sdk";
import { createStreamClientPool } from "./stream-lifecycle.mjs";

// Dedicated clients hydrate the existing login and never register their own
// push channel. Keep the original station-per-camera isolation for live video.
export function streamClientOptions(cfg) {
  return {
    email: cfg.email, password: cfg.password, countryCode: cfg.country,
    store: new FileSessionStore(cfg.session), openudid: cfg.openudid,
    autoRealtime: false,
  };
}
const pool = createStreamClientPool({
  makeOptions: streamClientOptions,
  makeClient: (options, sn) => {
    const client = new EufyMega(options);
    client.on("error", error => console.error(`[bridge] stream(${sn}) sdk error: ${error?.message ?? error}`));
    return client;
  },
  loginOk: LoginStatus.Ok,
});
export const acquireStreamClient = pool.acquire;
export const dropStreamClient = pool.drop;
export const closeStreamClients = pool.closeAll;
