// Configurable repair profiles. No household/device/account values in source.
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
let cached;
export function validateRepairConfig(options) {
  const serial = (value, model) => {
    if (!value) return '';
    if (typeof value !== 'string' || !new RegExp(`^${model}[A-Z0-9]{11}$`).test(value))
      throw Error(`Invalid ${model} serial; check app configuration`);
    return value;
  };
  const frontSerial = serial(options.s330_serial, 'T8530');
  const frontChime = serial(options.s330_chime_serial, 'T8021');
  const backSerial = serial(options.e330_serial, 'T8531');
  if (Boolean(frontSerial) !== Boolean(frontChime)) throw Error('Configure both S330 and T8021 serials');
  const frontChannel = options.s330_channel ?? 0;
  if (!Number.isInteger(frontChannel) || frontChannel < 0 || frontChannel > 255) throw Error('Invalid S330 channel');
  const mqttHost = options.mqtt_host || 'security-mqtt-us.anker.com';
  if (!/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(mqttHost)) throw Error('Invalid MQTT hostname');
  const mqttFallbackIps = options.mqtt_fallback_ips ?? [];
  if (!Array.isArray(mqttFallbackIps) || mqttFallbackIps.length > 6 || mqttFallbackIps.some(ip => isIP(ip) !== 4)) throw Error('Invalid optional MQTT fallback addresses');
  let backIdentity = null;
  if (options.e330_identity) {
    try { backIdentity = JSON.parse(options.e330_identity); } catch { throw Error('E330 identity must be valid JSON'); }
    if (backIdentity.target !== backSerial || !/^[a-f0-9]{40}$/i.test(backIdentity.adminUserId ?? '') ||
        !/^[a-f0-9]{40}$/i.test(backIdentity.cloudAccountId ?? '') ||
        !/^[\x20-\x7e]{1,64}$/.test(backIdentity.username ?? '') ||
        !/^(?:[a-f0-9]{2}){1,16}$/i.test(backIdentity.shortUserId ?? '')) throw Error('E330 identity does not match the configured lock');
  }
  if (options.enable_control === true && backSerial && !backIdentity) throw Error('Import this E330 account/device identity before enabling control');
  return { frontSerial, frontChime, frontChannel, backSerial, backIdentity, mqttHost,
    mqttFallbackIps, allowControl: options.enable_control === true };
}
export function getRepairConfig() {
  return cached ??= validateRepairConfig(JSON.parse(readFileSync(process.env.EUFY_LOCK_OPTIONS_FILE || '/data/options.json', 'utf8')));
}
