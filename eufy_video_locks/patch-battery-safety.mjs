import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const root = process.env.BRIDGE_PATCH_ROOT || "/app";
const sdkPath = root + "/node_modules/@mega-yfue/eufy-sdk";
if (JSON.parse(readFileSync(sdkPath + "/package.json", "utf8")).version !== "0.3.0")
  throw new Error("Battery safety requires review against the installed SDK");
const once = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error("Battery safety source changed; refusing patch");
  return source.replace(before, after);
};
// Emit only after the complete real poll succeeded; pollOnce catches failures,
// so wrapping its returned promise would incorrectly count failed polls.
const sdkFile = sdkPath + "/dist/index.js";
let sdk = readFileSync(sdkFile, "utf8");
sdk = once(sdk,
  '      for (const change of diff.params)\n        await this.widenCapabilities(change.deviceSn);\n    } catch (e) {\n      this.reportError(e);\n    }\n  }',
  '      for (const change of diff.params)\n        await this.widenCapabilities(change.deviceSn);\n      this.emit("bridgePollHealthy");\n    } catch (e) {\n      this.reportError(e);\n    }\n  }');
const routeFile = root + "/src/http-routes.mjs";
let routes = readFileSync(routeFile, "utf8");
routes = once(routes,
  'import { streamClientFor, dropStreamClient } from "../streams.mjs";',
  'import { acquireStreamClient, dropStreamClient } from "../streams.mjs";');
routes = once(routes,
  '      const idleSec = Math.round((Date.now() - flags.lastActivity) / 1000);',
  '      const idleSec = Math.round((Date.now() - flags.lastActivity) / 1000);\n      const pollIdleMs = Date.now() - (flags.lastPollSuccess ?? flags.lastActivity);');
routes = once(routes,
  '        stalled: flags.ready && idleSec * 1000 >= ctx.stallThresholdMs(),',
  '        lastPollSuccessSec: Math.round(pollIdleMs / 1000),\n        stalled: flags.ready && eufy.pollIntervalMs > 0 && eufy.opts?.autoRealtime !== false && pollIdleMs >= ctx.stallThresholdMs(),');
routes = once(routes,
  '  const openStreamClient = ctx.streamClientFor ?? streamClientFor;',
  '  const acquireClient = ctx.acquireStreamClient ?? (ctx.streamClientFor ?\n    async (sn, cfg) => ({ client: await ctx.streamClientFor(sn, cfg), release: () => {} }) : acquireStreamClient);\n  const viewers = new Map();');
routes = once(routes,
  '      try {\n        const client = await openStreamClient(sn, cfg); // its OWN P2P session — see streams.mjs',
  '      let lease;\n      let cleanup;\n      let disconnected = false;\n      const onGone = () => { disconnected = true; cleanup?.(); };\n      res.once?.("close", onGone);\n      req.once?.("aborted", onGone);\n      try {\n        lease = await acquireClient(sn, cfg);\n        const { client } = lease;\n        if (disconnected) { lease.release(); return; }');
routes = once(routes,
  '        if (!cam?.openReadable) return json(res, 404, { error: "no live video on this device" });',
  '        if (!cam?.openReadable) { lease.release(); return json(res, 404, { error: "no live video on this device" }); }');
routes = once(routes,
  '        ctx.noteStreamOpened?.(sn); // reachable again → clear any failure backoff',
  '        if (disconnected) { feed.destroy(); lease.release(); return; }\n        ctx.noteStreamOpened?.(sn); // reachable again → clear any failure backoff');
routes = once(routes,
  '        activeStreams.set(sn, { feed, startedAt: Date.now() });',
  '        let feeds = viewers.get(sn);\n        if (!feeds) viewers.set(sn, (feeds = new Set()));\n        feeds.add(feed);\n        if (!activeStreams.has(sn)) activeStreams.set(sn, {\n          feed: { destroy: () => { for (const f of [...feeds]) f.destroy(); } }, startedAt: Date.now()\n        });');
const oldCleanup = '        // streaming.delete returns true only on the first cleanup for this feed → broadcast "off" once.\n        const cleanup = () => {\n          void still.flush(); // no-op after the first call\n          feed.destroy();\n          if (streaming.delete(sn)) ctx.broadcast({ event: "streamState", deviceSn: sn, active: false });\n          activeStreams.delete(sn);\n        };\n        req.on("close", cleanup);\n        feed.on("error", cleanup);\n        feed.on("close", cleanup);';
const newCleanup = '        let cleaned = false;\n        cleanup = () => {\n          if (cleaned) return;\n          cleaned = true;\n          res.off?.("close", onGone);\n          req.off?.("aborted", onGone);\n          void still.flush();\n          feed.destroy();\n          feeds.delete(feed);\n          lease.release();\n          if (feeds.size === 0) {\n            viewers.delete(sn);\n            activeStreams.delete(sn);\n            if (streaming.delete(sn)) ctx.broadcast({ event: "streamState", deviceSn: sn, active: false });\n          }\n        };\n        feed.on("error", cleanup);\n        feed.on("end", () => { res.end(); cleanup(); });\n        feed.on("close", () => { res.end(); cleanup(); });\n        if (feed.destroyed || feed.readableEnded) cleanup();';
routes = once(routes, oldCleanup, newCleanup);
routes = once(routes,
  '        dropClient(sn); // never reuse a session that just failed — see dropStreamClient in streams.mjs',
  '        res.off?.("close", onGone);\n        req.off?.("aborted", onGone);\n        if (cleanup) cleanup();\n        lease?.release({ failed: true });\n        if (lease) dropClient(sn, lease.client); // Active sibling viewers retain their lease.\n        if (disconnected) return;');
const watchdogFile = root + "/src/watchdog.mjs";
const watchdog = readFileSync(watchdogFile, "utf8");
if (createHash('sha256').update(watchdog).digest('hex') !== '8bb037ef4937a456d617b846593357bb623a1c7e85089adc73c27af48debe6e9')
  throw new Error("Unexpected watchdog source");
const replacement = readFileSync(root + "/src/watchdog-battery-safe.mjs", "utf8");
// All source guards pass before any existing file is overwritten.
writeFileSync(sdkFile, sdk);
writeFileSync(routeFile, routes);
writeFileSync(watchdogFile, replacement);
