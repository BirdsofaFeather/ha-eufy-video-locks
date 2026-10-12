// Cloud poll completion is independent of changed device properties. A quiet
// home must not cause account-wide reconnects. Failed/hung polls and a down push
// channel still trigger the original recovery path.
import { LoginStatus } from "@mega-yfue/eufy-sdk";

export function createWatchdog(ctx) {
  const { eufy, PUSH_STALL_MS } = ctx;
  const { flags } = ctx.state;
  eufy.on("bridgePollHealthy", () => { flags.lastPollSuccess = Date.now(); });
  const bumpActivity = () => { flags.lastActivity = Date.now(); };
  function stallThresholdMs() {
    return Math.max(3 * (eufy.pollIntervalMs || 600_000), 30 * 60_000);
  }
  async function watchdogTick() {
    if (!flags.ready || flags.recovering) return;
    const now = Date.now();
    const idleMs = now - (flags.lastPollSuccess ?? flags.lastActivity);
    const pushDeadMs = flags.pushConnected ? 0 : now - flags.pushSince;
    const pollEnabled = eufy.pollIntervalMs > 0 && eufy.opts?.autoRealtime !== false;
    const pollStalled = pollEnabled && idleMs >= stallThresholdMs();
    const pushStalled = pushDeadMs >= PUSH_STALL_MS;
    if (!pollStalled && !pushStalled) return;
    flags.recovering = true;
    const why = pollStalled ? `poll success overdue ${Math.round(idleMs / 1000)}s` : `push down ${Math.round(pushDeadMs / 1000)}s`;
    console.error(`[bridge] realtime stalled (${why}) — re-establishing`);
    try {
      await eufy.disconnect();
      const result = await eufy.login();
      await ctx.applyLogin(result);
      if (result.status !== LoginStatus.Ok) {
        console.error(`[bridge] re-login not OK (${result.status}) — exiting for a clean restart`);
        process.exit(1);
      }
      eufy.setPollInterval(eufy.pollIntervalMs);
      flags.lastPollSuccess = Date.now(); // Give the newly armed loop a full recovery window.
      flags.lastActivity = Date.now();
      flags.pushSince = Date.now();
      console.log("[bridge] realtime re-established after stall");
    } catch (error) {
      console.error(`[bridge] stall recovery failed (${error?.message ?? error}) — exiting for a clean restart`);
      process.exit(1);
    } finally { flags.recovering = false; }
  }
  return { bumpActivity, stallThresholdMs, watchdogTick };
}
