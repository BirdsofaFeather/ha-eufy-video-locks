import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getRepairConfig } from './repair-config.mjs';
import { parseCredentials } from './bridge-access.mjs';
import { startSetupUi } from './setup-ui.mjs';
const options = JSON.parse(readFileSync('/data/options.json', 'utf8'));
getRepairConfig(); // Validate profiles before login or any device connection.
if (!options.email || !options.password || !/^[A-Z]{2}$/.test(options.country || '')) throw Error('Enter Eufy credentials and a two-letter country in Configuration');
const keyPath = '/data/bridge-auth-private.json';
if (!existsSync(keyPath)) writeFileSync(keyPath, JSON.stringify({version:1,httpToken:randomBytes(32).toString('hex'),rtspPassword:randomBytes(32).toString('hex')}), {mode:0o600});
chmodSync(keyPath, 0o600);
const keys = parseCredentials(readFileSync(keyPath, 'utf8'));
await startSetupUi(keys);
const openudidPath = '/data/client-id';
if (!existsSync(openudidPath)) writeFileSync(openudidPath, randomBytes(16).toString('hex'), {mode:0o600});
const env = {...process.env, EUFY_EMAIL:options.email, EUFY_PASSWORD:options.password, EUFY_COUNTRY:options.country,
  EUFY_SESSION:'/data/.eufy-session.json', GO2RTC_CONFIG:'/data/go2rtc.yaml', BRIDGE_OPENUDID:readFileSync(openudidPath,'utf8').trim(),
  BRIDGE_HOST:'0.0.0.0', BRIDGE_PORT:'3000', BRIDGE_SELF_HOST:'127.0.0.1',
  EUFY_POLL_MS:String(options.poll_ms ?? 600000), STREAM_IDLE_MS:String(options.stream_idle_ms ?? 300000),
  RTSP_IDLE_OFF_MS:String(options.rtsp_idle_off_ms ?? 300000), BRIDGE_PREWARM:'0', BRIDGE_DEBUG:'0', BRIDGE_DEBUG_P2P:'0',
  BRIDGE_EVENT_LOG:options.event_log ? '1':'0', GO2RTC_ENABLE:'1'};
if (options.stream_battery_budget_ms) env.STREAM_BATTERY_BUDGET_MS=String(options.stream_battery_budget_ms);
// No discovery, lock/unlock test, or automatic actuation is performed here.
const child = spawn('/usr/local/bin/eufy-sdk-bridge', [], {env, stdio:'inherit'});
child.on('error', () => { console.error('Bridge launcher failed'); process.exit(1); });
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
