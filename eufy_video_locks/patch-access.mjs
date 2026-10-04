// Modified for configurable public distribution, October 2026.
// Build-time guards: unexpected upstream code must fail before an image is produced.
import { readFileSync, writeFileSync } from "node:fs";
function replaceOnce(source, anchor, replacement, name) {
  if (source.split(anchor).length !== 2) throw new Error("Unexpected upstream anchor: " + name);
  return source.replace(anchor, replacement);
}
const root = process.env.BRIDGE_PATCH_ROOT || "/app";
const files = new Map();
let ws = readFileSync(root + "/src/ws-server.mjs", "utf8");
ws = 'import { loadCredentials, hasCredential } from "./bridge-access.mjs";\n' + ws;
ws = replaceOnce(ws, '  const { cfg, eufy, SCHEMA_VERSION, DEBUG, dbg } = ctx;',
  '  const credentials = loadCredentials();\n  const { cfg, eufy, SCHEMA_VERSION, DEBUG, dbg } = ctx;', "ws context");
ws = replaceOnce(ws, 'new WebSocketServer({ server: httpServer, path: "/ws" })',
  'new WebSocketServer({ server: httpServer, path: "/ws", verifyClient: (info, done) => done(hasCredential(info.req, credentials), 401, "Unauthorized") })', "ws handshake");
files.set(root + "/src/ws-server.mjs", ws);
let http = readFileSync(root + "/src/http-routes.mjs", "utf8");
http = 'import { loadCredentials, allowsHttp } from "./bridge-access.mjs";\n' + http;
http = replaceOnce(http, 'export function createHttpHandler(ctx) {',
  'export function createHttpHandler(ctx) {\n  const credentials = loadCredentials();', "http context");
http = replaceOnce(http, '  return async function handleHttp(req, res) {',
  '  return async function handleHttp(req, res) {\n    if (!allowsHttp(req, credentials)) return json(res, 401, { error: "Unauthorized" });', "http gate");
files.set(root + "/src/http-routes.mjs", http);
let media = readFileSync(root + "/go2rtc-config.mjs", "utf8");
media = 'import { loadCredentials } from "./src/bridge-access.mjs";\nimport { chmod } from "node:fs/promises";\n' + media;
media = replaceOnce(media, 'export async function writeGo2rtcConfig(cfg, devices) {',
  'export async function writeGo2rtcConfig(cfg, devices) {\n  const credentials = loadCredentials();', "media credentials");
media = replaceOnce(media, `'  listen: ":1984"'`, `'  listen: "127.0.0.1:1984"'`, "media api binding");
media = replaceOnce(media, `'  listen: ":8554"',`,
  `'  listen: ":8554"',\n    '  username: "homeassistant"',\n    '  password: ' + JSON.stringify(credentials.rtspPassword),`, "rtsp authentication");
media = replaceOnce(media, `'  listen: ":8555"'`, `'  listen: "127.0.0.1:8555"'`, "webrtc binding");
media = replaceOnce(media, 'await writeFile(cfg.go2rtcConfig, yaml, "utf8");',
  'await writeFile(cfg.go2rtcConfig, yaml, { encoding: "utf8", mode: 0o600 });\n  await chmod(cfg.go2rtcConfig, 0o600);', "media config permissions");
files.set(root + "/go2rtc-config.mjs", media);
for (const [name, text] of files) writeFileSync(name, text);
