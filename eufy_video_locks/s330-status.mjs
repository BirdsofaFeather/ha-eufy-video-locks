import { getRepairConfig } from './repair-config.mjs';
const frontSerial = () => getRepairConfig().frontSerial;
const frontChime = () => getRepairConfig().frontChime;
const frontChannel = () => getRepairConfig().frontChannel;
// Modified for configurable public distribution, October 2026.
// Read-only status adapter, pinned to the observed Front Door S330 and SDK 0.3.0.
// Eufy's legacy lock status: 3=unlocked, 4=locked, 5=mechanical anomaly.
// Never turn an absent, malformed or jammed status into an unlocked assertion.

export function decodeS330LockState(value) {
  if (value === '3' || value === 3) return false;
  if (value === '4' || value === 4) return true;
  return null;
}
function timestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 1e12 ? value * 1000 : value;
}
export function createS330Status(eufy, now = Date.now) {
  if (typeof eufy.on !== 'function' || typeof eufy.registry?.require !== 'function')
    throw new Error('S330 status SDK interfaces changed');
  let latestEvent;
  eufy.on('lockState', event => {
    if (event?.deviceSn === frontSerial() && typeof event.locked === 'boolean')
      latestEvent = { locked: event.locked, at: now() };
  });
  return function apply(dev, out) {
    // Do not broaden this fix to other locks, models or transport paths.
    if (!frontSerial() || dev.sn !== frontSerial() || dev.model !== 'T8530') return out;
    const record = eufy.registry.require(frontSerial());
    if (record.model !== 'T8530' || record.stationSn !== frontChime() || dev.stationSn !== frontChime())
      throw new Error('S330 status device/chime identity changed');
    const cloudAt = timestamp(record.paramUpdatedAt?.[1912]);
    // A cloud read can return an older snapshot AFTER a fresh push event. The
    // PropertyValue.ts is local read time, not Eufy's state update time.
    if (latestEvent && (cloudAt === null || cloudAt <= latestEvent.at)) {
      out.locked = latestEvent.locked;
      out.lockStatusSource = 'live-lock-event';
      out.lockStatusUpdatedAt = new Date(latestEvent.at).toISOString();
    } else {
      out.locked = decodeS330LockState(out.unknown_1912);
      out.lockStatusSource = 'eufy-param-1912';
      out.lockStatusUpdatedAt = cloudAt === null ? null : new Date(cloudAt).toISOString();
    }
    return out;
  };
}
