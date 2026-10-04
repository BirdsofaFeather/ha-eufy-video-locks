import { getRepairConfig } from './repair-config.mjs';
const frontSerial = () => getRepairConfig().frontSerial;
const frontChime = () => getRepairConfig().frontChime;
const frontChannel = () => getRepairConfig().frontChannel;
// Modified for configurable public distribution, October 2026.
import { createCipheriv } from "node:crypto";
// SDK 0.3.0 declares video on these locks, but camera() is camera-codec-only.
// Expose only the media provider, never camera power/privacy or actuator methods.
const doors = () => new Map([[frontSerial(), 'T8530'], [getRepairConfig().backSerial, 'T8531']].filter(([sn]) => sn));

export function isVerifiedDoorSummary(summary) {
  // Both exact devices produced real app video in the saved packet captures.
  // The E330 cloud record omits the generic video capability; do not fabricate
  // SDK parameters to grant it camera power/privacy capabilities.
  return doors().get(summary.sn) === summary.model && summary.capabilities?.includes("lock");
}



const configuredClients = new WeakSet();
const configuredSessions = new WeakSet();

// Legacy video frames are encrypted int commands, not the int+string structure
// used by switches. Capture proof: command 1003, channel 0, signCode 2, 272-byte
// encrypted body. Never put a session key or media private key in a log.
export function sendLegacyMedia(session, command, channel, publicModulus = "") {
  if (![1003, 1004].includes(command) || channel !== frontChannel() ||
      session.cfg?.stationSn !== frontChime() || !session.connectAddress ||
      !Buffer.isBuffer(session.level1Key) || session.level1Key.length !== 16 ||
      !Number.isInteger(session.seqNumber) || typeof session.send !== "function")
    throw new Error("S330 legacy video route unavailable");
  if (command === 1003 && !/^[a-f0-9]{256}$/i.test(publicModulus))
    throw new Error("S330 video public modulus invalid");
  if (command === 1004 && publicModulus !== "")
    throw new Error("Stop video must not carry a public modulus");
  const body = Buffer.alloc(command === 1003 ? 272 : 16);
  body.writeUInt32LE(channel, 0);
  if (publicModulus) body.write(publicModulus, 4, "ascii");
  const cipher = createCipheriv("aes-128-ecb", session.level1Key, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const header = Buffer.alloc(10);
  Buffer.from([0xd1,0,0,0,0x58,0x5a,0x59,0x48]).copy(header);
  header.writeUInt16BE(session.seqNumber, 2);
  header.writeUInt16LE(command, 8);
  const framing = Buffer.from([0,0,0,0,1,0,channel,2,0,0]);
  framing.writeUInt16LE(encrypted.length, 0);
  const packet = Buffer.concat([header, framing, encrypted]);
  session.seqNumber = (session.seqNumber + 1) & 65535;
  session.send(session.connectAddress, Buffer.from([0xf1,0xd0]), packet);
}

export function configureFrontVideo(client) {
  // Apply to a dedicated video-only client. The main control client cannot enter
  // this path, including when it is asked for a snapshot.
  if (client.opts?.autoRealtime !== false || typeof client.p2p?.resolveSession !== "function")
    throw new Error("S330 video requires a dedicated stream client");
  if (configuredClients.has(client)) return;
  const router = client.p2p;
  const original = router.resolveSession.bind(router);
  router.resolveSession = async (sn, options = {}) => {
    if (sn !== frontSerial() || options.requireLevel2ForAttached !== true)
      return original(sn, options);
    const route = await original(sn, { ...options, waitLevel2: false, requireLevel2ForAttached: false });
    if (route.parentSn !== frontChime() || route.channel !== frontChannel() || !route.homeBaseAttached ||
        route.session?.cfg?.stationSn !== frontChime())
      throw new Error("S330 video chime/channel changed; review route before streaming");
    const session = route.session;
    if (!configuredSessions.has(session)) {
      if (typeof session.rsaModulus !== "function" || typeof session.sendCommand !== "function")
        throw new Error("S330 video SDK interfaces changed");
      let started = false;
      const originalStart = session.startLiveMedia.bind(session);
      const originalStop = session.stopLiveMedia.bind(session);
      session.startLiveMedia = (channel, accountId, attached, opts) => {
        if (channel !== frontChannel() || !attached) return originalStart(channel, accountId, attached, opts);
        if (!started || opts?.force) {
          sendLegacyMedia(session, 1003, channel, session.rsaModulus());
          started = true;
        } else session.sendCommand(1139, channel);
      };
      session.stopLiveMedia = (channel, accountId) => {
        if (channel !== frontChannel()) return originalStop(channel, accountId);
        sendLegacyMedia(session, 1004, channel);
        started = false;
      };
      configuredSessions.add(session);
    }
    return route;
  };
  configuredClients.add(client);
}

export async function videoProviderFor(client, sn, { dedicatedVideo = false } = {}) {
  const device = await client.getDevice(sn);
  const camera = device.camera?.();
  if (camera?.openReadable) return camera;
  if (doors().get(sn) !== device.model || !device.has("lock")) return camera;
  if (typeof client.mediaProviderFor !== "function" || typeof client.connectStation !== "function")
    throw new Error("Verified door-video SDK interfaces unavailable");
  if (sn === frontSerial() && dedicatedVideo) configureFrontVideo(client);
  const provider = client.mediaProviderFor(sn);
  if (typeof provider?.openReadable !== "function")
    throw new Error("Declared door video has no bound media provider");
  return {
    snapshotStored: provider.snapshotStored?.bind(provider),
    snapshotLive: async (options = {}) => {
      await client.connectStation(sn, AbortSignal.timeout(45000));
      return provider.snapshotLive({ ...options, powered: false });
    },
    openReadable: async (options = {}) => {
      // Stream clients intentionally disable automatic realtime to avoid stealing
      // the control client's push registration. Open only this station explicitly.
      await client.connectStation(sn, AbortSignal.timeout(45000));
      return provider.openReadable({ ...options, powered: false });
    },
  };
}
