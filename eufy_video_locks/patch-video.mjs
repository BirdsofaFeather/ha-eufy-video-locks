// Modified for configurable public distribution, October 2026.
import { readFileSync, writeFileSync } from "node:fs";
const root = process.env.BRIDGE_PATCH_ROOT || "/app";
const pkg = JSON.parse(readFileSync(root + "/node_modules/@mega-yfue/eufy-sdk/package.json", "utf8"));
if (pkg.version !== "0.3.0") throw new Error("Door video requires review against the installed SDK");
const path = root + "/src/http-routes.mjs";
const source = readFileSync(path, "utf8");
const anchor = 'const cam = (await client.getDevice(sn)).camera?.();';
if (source.split(anchor).length !== 2 || source.includes('videoProviderFor'))
  throw new Error("Unexpected stream provider source");
const next = 'import { videoProviderFor } from "./door-video.mjs";\n' +
  source.replace(anchor, 'const cam = await videoProviderFor(client, sn, { dedicatedVideo: true });');
const snapshotAnchor = 'const cam = device.camera?.();';
if (next.split(snapshotAnchor).length !== 2) throw new Error("Unexpected snapshot provider source");
const withSnapshot = next.replace(snapshotAnchor, 'const cam = await videoProviderFor(eufy, sn);');
const viewPath = root + "/src/device-view.mjs";
const view = readFileSync(viewPath, "utf8");
const viewAnchor = 'const isCamera = m.capabilities.includes("camera") || m.capabilities.includes("video");';
if (view.split(viewAnchor).length !== 2 || view.includes('isVerifiedDoorSummary'))
  throw new Error("Unexpected device-view source");
const nextView = 'import { isVerifiedDoorSummary } from "./door-video.mjs";\n' +
  view.replace(viewAnchor, 'const isCamera = m.capabilities.includes("camera") || m.capabilities.includes("video") || isVerifiedDoorSummary(m);');
writeFileSync(path, withSnapshot);
writeFileSync(viewPath, nextView);
