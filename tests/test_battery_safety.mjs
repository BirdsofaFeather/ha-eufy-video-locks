import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { test, mock } from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { EufyMega, LoginStatus, SharedLiveSource } from "../.test-runtime/node_modules/@mega-yfue/eufy-sdk/dist/index.js";
import { createWatchdog } from "../.test-runtime/src/watchdog.mjs";
import { createStreamClientPool } from "../eufy_video_locks/stream-lifecycle.mjs";
import { videoProviderFor } from "../eufy_video_locks/door-video.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fakeWatchdog(interval = 600000) {
  const eufy = new EventEmitter();
  let recoveries = 0;
  Object.assign(eufy, {
    opts: {}, pollIntervalMs: interval,
    disconnect: async () => { recoveries++; },
    login: async () => ({ status: LoginStatus.Ok }), setPollInterval: () => {},
    registry: { pollChanges: async () => ({ added: [], removed: [], params: [], reported: [] }) },
    applyPolledParams: () => {}, reportError: () => {},
  });
  const flags = { ready: true, recovering: false, lastActivity: Date.now() - 2000000,
    pushConnected: true, pushSince: Date.now() };
  const watchdog = createWatchdog({ eufy, PUSH_STALL_MS: 300000, state: { flags }, applyLogin: async () => {} });
  return { eufy, flags, watchdog, recoveries: () => recoveries };
}
test("real SDK unchanged cloud poll prevents false reconnect; device events cannot hide failed polls", async () => {
  const f = fakeWatchdog();
  await EufyMega.prototype.pollOnce.call(f.eufy);
  await f.watchdog.watchdogTick();
  assert.equal(f.recoveries(), 0);
  f.flags.lastPollSuccess = Date.now() - 2000000;
  f.eufy.registry.pollChanges = async () => { throw Error("offline failure"); };
  await EufyMega.prototype.pollOnce.call(f.eufy);
  f.watchdog.bumpActivity();
  await f.watchdog.watchdogTick();
  assert.equal(f.recoveries(), 1);
});
test("hung polls still recover, disabled polling does not recover, push failures still do", async () => {
  const hung = fakeWatchdog();
  hung.eufy.registry.pollChanges = () => new Promise(() => {});
  void EufyMega.prototype.pollOnce.call(hung.eufy);
  await hung.watchdog.watchdogTick(); assert.equal(hung.recoveries(), 1);
  const disabled = fakeWatchdog(0);
  await disabled.watchdog.watchdogTick(); assert.equal(disabled.recoveries(), 0);
  disabled.flags.pushConnected = false; disabled.flags.pushSince = Date.now() - 400000;
  await disabled.watchdog.watchdogTick(); assert.equal(disabled.recoveries(), 1);
  const slow = fakeWatchdog(1200000);
  await slow.watchdog.watchdogTick(); assert.equal(slow.recoveries(), 0);
  slow.flags.lastActivity = Date.now() - 4000000;
  await slow.watchdog.watchdogTick(); assert.equal(slow.recoveries(), 1);
  const hostManaged = fakeWatchdog(); hostManaged.eufy.opts.autoRealtime = false;
  await hostManaged.watchdog.watchdogTick(); assert.equal(hostManaged.recoveries(), 0);
});
test("both door adapters arm and expire real SDK battery budgets and stop live media", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    for (const [sn, model] of [["T853000000000000", "T8530"], ["T853100000000000", "T8531"]]) {
      // Provider integration is tested below; the actual source protects a live keyframe.
      const stream = new EventEmitter(); let stopped = 0;
      stream.start = () => {}; stream.stop = () => { stopped++; };
      const source = new SharedLiveSource({ makeStream: () => stream, powered: "battery",
        batteryBudgetMs: 1000, budgetGraceMs: 100, lingerMs: 0 });
      const consumer = source.attach(); consumer.on("error", () => {});
      stream.emit("video", { data: Buffer.from([0,0,0,1,0x65,0x88]), keyframe: true, codec: "h264", width: 640, height: 480, timestamp: 0 });
      assert.equal(source.budgetTimer.pending, true, model);
      mock.timers.tick(1000); assert.equal(source.budgetGraceTimer.pending, true);
      mock.timers.tick(100); assert.equal(source.state, "stopped"); assert.equal(stopped, 1);
      source.dispose();
    }
  } finally { mock.timers.reset(); }
});
test("adapter power and immediate stop cannot be overridden by a caller", async () => {
  for (const [sn, model] of [["T853000000000000", "T8530"], ["T853100000000000", "T8531"]]) {
    const options = [];
    const p = await videoProviderFor({ getDevice: async () => ({ model, has: () => true }),
      connectStation: async () => {}, mediaProviderFor: () => ({
        openReadable: async o => options.push(o), snapshotLive: async o => options.push(o),
      }) }, sn);
    await p.openReadable({ powered: false, lingerMs: 8000, batteryBudgetMs: 1234 });
    await p.snapshotLive({ powered: "wired" });
    for (const o of options) { assert.equal(o.powered, "battery"); assert.equal(o.lingerMs, 0); }
    assert.equal(options[0].batteryBudgetMs, 1234);
  }
});
test("pool shares concurrent login and closes only after the last viewer; quick reattach cancels close", async () => {
  let creations = 0, disconnects = 0;
  const pool = createStreamClientPool({ makeOptions: () => ({}), loginOk: "ok", teardownMs: 10,
    makeClient: () => { creations++; return { login: async () => { await delay(5); return { status: "ok" }; },
      disconnect: async () => { disconnects++; } }; } });
  const [a, b] = await Promise.all([pool.acquire("test", {}), pool.acquire("test", {})]);
  assert.equal(creations, 1); assert.equal(a.client, b.client);
  a.release(); a.release(); await delay(20); assert.equal(disconnects, 0);
  b.release(); const c = await pool.acquire("test", {});
  await delay(20); assert.equal(disconnects, 0); assert.equal(creations, 1);
  c.release(); await delay(20); assert.equal(disconnects, 1);
  const d = await pool.acquire("test", {}); assert.equal(creations, 2);
  assert.equal(pool.drop("test", a.client), false); d.release(); await pool.closeAll(); assert.equal(disconnects, 2);
});
test("failed viewer cannot disconnect a sibling; hydration failure is torn down and retry creates a fresh client", async () => {
  let disconnects = 0, count = 0;
  const pool = createStreamClientPool({ makeOptions: () => ({}), loginOk: "ok", teardownMs: 1,
    makeClient: () => { count++; return { login: async () => ({ status: count === 1 ? "fail" : "ok" }),
      disconnect: async () => { disconnects++; } }; } });
  await assert.rejects(() => pool.acquire("x", {})); await delay(1); assert.equal(disconnects, 1);
  const a = await pool.acquire("x", {}), b = await pool.acquire("x", {});
  a.release({ failed: true }); await delay(5); assert.equal(disconnects, 1);
  await assert.rejects(() => pool.acquire("x", {}), /existing viewers/);
  b.release(); await delay(5); assert.equal(disconnects, 2);
  const c = await pool.acquire("x", {}); c.release(); await pool.closeAll(); assert.equal(disconnects, 3);
});

process.env.BRIDGE_STREAM_CONSUMER_LOG_MS = "0";
// Supply synthetic access credentials only to the real route's file read.
// Production authentication code is unchanged and remains fail-closed.
const readFile = fs.readFileSync;
mock.method(fs, "readFileSync", (path, ...args) => path === "/data/bridge-auth-private.json" ?
  JSON.stringify({ version: 1, httpToken: "a".repeat(64), rtspPassword: "b".repeat(64) }) : readFile(path, ...args));
syncBuiltinESMExports();
const { createHttpHandler } = await import("../.test-runtime/src/http-routes.mjs");
const { createState } = await import("../.test-runtime/src/state.mjs");
const { loadConfig } = await import("../.test-runtime/src/config.mjs");
function response() {
  const res = new Writable({ write(chunk, encoding, cb) { cb(); } });
  res.writeHead = status => { res.status = status; };
  return res;
}
test("HTTP end/close releases once, sibling status stays live, and idle sweep can stop all viewers", async () => {
  const state = createState(); state.flags.ready = true;
  const feeds = [], releases = [], events = [];
  const handler = createHttpHandler({ ...loadConfig({ EUFY_EMAIL: "test@example.invalid", EUFY_PASSWORD: "unused" }),
    state, eventLog: () => {}, broadcast: e => events.push(e),
    acquireStreamClient: async () => { const feed = new PassThrough(); feeds.push(feed); let released = 0;
      return { client: { getDevice: async () => ({ camera: () => ({ openReadable: async () => feed }) }) },
        release: () => { releases.push(++released); } }; }, dropStreamClient: () => {},
  });
  const req = () => Object.assign(new EventEmitter(), { url: "/stream/TEST", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost" } });
  const a = response(), b = response();
  await handler(req(), a); await handler(req(), b);
  a.destroy(); await delay(5); assert.deepEqual(releases, [1]); assert.equal(state.streaming.has("TEST"), true);
  state.activeStreams.get("TEST").feed.destroy(); await delay(5);
  assert.deepEqual(releases, [1, 1]); assert.equal(state.streaming.has("TEST"), false);
  assert.deepEqual(events.filter(e => e.event === "streamState").map(e => e.active), [true, false]);
  const c = response(); await handler(req(), c); feeds[2].end(); await delay(5);
  assert.equal(releases.length, 3); assert.equal(state.activeStreams.size, 0);
});
test("HTTP abandoned open and no-camera return release their reserved lease", async () => {
  const state = createState(); state.flags.ready = true;
  let resolve, releases = 0, opened = 0;
  const ctx = { ...loadConfig({ EUFY_EMAIL: "test@example.invalid", EUFY_PASSWORD: "unused" }), state,
    eventLog: () => {}, broadcast: () => {}, dropStreamClient: () => {},
    acquireStreamClient: () => new Promise(r => { resolve = r; }),
  };
  const req = Object.assign(new EventEmitter(), { url: "/stream/TEST", method: "GET", socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost" } });
  const res = response(), running = createHttpHandler(ctx)(req, res);
  res.destroy(); await delay(1);
  resolve({ client: { getDevice: async () => { opened++; } }, release: () => { releases++; } });
  await running; assert.equal(releases, 1); assert.equal(opened, 0);
  ctx.acquireStreamClient = async () => ({ client: { getDevice: async () => ({ model: "unknown", has: () => false }) }, release: () => { releases++; } });
  const res2 = response(); await createHttpHandler(ctx)(req, res2);
  assert.equal(res2.status, 404); assert.equal(releases, 2);
});
