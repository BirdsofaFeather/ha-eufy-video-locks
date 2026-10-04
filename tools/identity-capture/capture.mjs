// Bounded, subscribe-only companion. It runs on the user's computer, outside Home Assistant.
import {mkdirSync,writeFileSync,chmodSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {resolve4} from 'node:dns/promises';
import {isIP} from 'node:net';
import {emitKeypressEvents} from 'node:readline';
import {createCollector} from './decode.mjs';

function prompt(label,{hidden=false}={}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new CaptureError('Use an interactive local Terminal; redirected input is refused.');
  process.stdout.write(label);
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve,reject)=>{
    let value='';
    const done=(error)=>{process.stdin.off('keypress',onKey);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
    const onKey=(str,key={})=>{
      if (key.ctrl && key.name==='c') return done(new CaptureError('Capture cancelled.'));
      if (key.name==='return' || key.name==='enter') return done();
      if (key.name==='backspace') {if(value.length){value=value.slice(0,-1);if(!hidden)process.stdout.write('\b \b');}return;}
      if (!key.ctrl && !key.meta && str && !/[\x00-\x1f\x7f]/.test(str)) {value+=str;if(!hidden)process.stdout.write(str);}
    };
    process.stdin.on('keypress',onKey);
  });
}

class CaptureError extends Error {}
const here=dirname(fileURLToPath(import.meta.url));
const output=resolve(here,'private');
const clients=[]; let eufy;
async function cleanup() {
  await Promise.allSettled(clients.map(c=>c.disconnect()));
  if (eufy) await eufy.disconnect().catch(()=>{});
}
async function bounded(promise, ms, label) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new CaptureError(label)),ms);})]);}
  finally {clearTimeout(timer);}
}

async function main() {
  const [major,minor]=process.versions.node.split('.').map(Number);
  if (major<24 || (major===24 && minor<5)) throw new CaptureError('Install Node.js 24.5 or newer first.');
  const pkg=JSON.parse(readFileSync(resolve(here,'node_modules/@mega-yfue/eufy-sdk/package.json'),'utf8'));
  if (pkg.version!=='0.3.0') throw new CaptureError('This capture helper requires SDK 0.3.0; run npm ci --ignore-scripts in this folder.');
  const {EufyMega,MemorySessionStore,LoginStatus,SecureMqtt,buildAppShapedClientId,mqttUuidFrom}=await import('@mega-yfue/eufy-sdk');
  console.log('PRIVATE E330 CAPTURE — subscribes only; sends no device/settings/video commands.');
  console.log('Sign the phone into the SAME Eufy account as Home Assistant. Turn Bluetooth off.');
  const email=(await prompt('Bridge Eufy account email (hidden): ',{hidden:true})).trim();
  const password=await prompt('Eufy password (hidden): ',{hidden:true});
  const country=(await prompt('Two-letter account country, e.g. US: ')).trim().toUpperCase();
  const serial=(await prompt('Your E330/T8531 serial (hidden): ',{hidden:true})).trim().toUpperCase();
  if (!email || !password || !/^[A-Z]{2}$/.test(country) || !/^T8531[A-Z0-9]{11}$/.test(serial)) throw new CaptureError('Account country or T8531 serial is invalid.');
  const openudid=randomBytes(16).toString('hex');
  eufy=new EufyMega({email,password,countryCode:country,openudid,store:new MemorySessionStore(),autoRealtime:false,pollMs:0,noBroadcast:true,storedSnapshotCache:false});
  eufy.on('error',()=>{});
  let login=await bounded(eufy.login(),60000,'Cloud login timed out.');
  for (let attempt=0;login.status!==LoginStatus.Ok && attempt<3;attempt++) {
    if (login.status===LoginStatus.TwoFactor) login=await bounded(eufy.submitVerifyCode((await prompt('Eufy verification code (hidden): ',{hidden:true})).trim()),60000,'Verification timed out.');
    else if (login.status===LoginStatus.Captcha) {
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(login.image??'')) throw new CaptureError('Unsupported captcha format.');
      mkdirSync(output,{recursive:true,mode:0o700});chmodSync(output,0o700);
      const path=resolve(output,`captcha-${attempt}-private.png`);
      writeFileSync(path,Buffer.from(login.image.split(',')[1],'base64'),{mode:0o600,flag:'wx'});
      console.log(`Open tools/identity-capture/private/captcha-${attempt}-private.png locally to read the captcha.`);
      login=await bounded(eufy.solveCaptcha((await prompt('Captcha answer (hidden): ',{hidden:true})).trim()),60000,'Captcha verification timed out.');
    } else throw new CaptureError('Eufy login did not complete; inspect the account in the Eufy app and do not retry rapidly.');
  }
  if (login.status!==LoginStatus.Ok) throw new CaptureError('Login challenge limit reached.');
  await bounded(eufy.getDevices(),30000,'Device discovery timed out.');
  const dev=eufy.registry.list().find(d=>d.sn===serial && d.model==='T8531');
  const ownerId=dev?.raw?.member?.admin_user_id, accountId=eufy.mega.auth?.userId;
  if (!/^[a-f0-9]{40}$/i.test(ownerId??'') || !/^[a-f0-9]{40}$/i.test(accountId??'')) throw new CaptureError('This account does not expose the expected T8531 membership record.');
  const credentials=await bounded(eufy.getUserMqttInfo('eufy_security'),30000,'Cloud MQTT authorization timed out.');
  const shard=eufy.mega.regionShard.split('-')[0];
  const defaultHost=['us','eu'].includes(shard) ? `security-mqtt-${shard}.anker.com` : '';
  console.log('Use mqtt_host from your bridge configuration, or the verified security broker from a private phone capture.');
  const enteredHost=(await prompt(`Broker hostname [${defaultHost || "enter your bridge mqtt_host"}]: `)).trim();
  const host=enteredHost || defaultHost;
  if (!/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) || host.includes('--')) throw new CaptureError('A valid regional broker hostname is required.');
  const extra=(await prompt('Optional observed broker IPv4 addresses, comma separated; normally blank (hidden): ',{hidden:true})).trim();
  const fallbacks=extra?extra.split(',').map(x=>x.trim()):[];
  if (fallbacks.length>6 || fallbacks.some(x=>isIP(x)!==4)) throw new CaptureError('Invalid optional broker IPv4 address.');
  const discovered=await bounded(resolve4(host).catch(()=>[]),10000,'Broker DNS lookup timed out.');
  const addresses=[...new Set([...fallbacks,...discovered])].slice(0,6);
  if (!addresses.length) throw new CaptureError('No regional broker addresses resolved.');
  const req=`cmd/eufy_security/T8531/${serial}/req`, res=req.replace('/req','/res');
  const sinceSeconds=Math.floor(Date.now()/1000);
  const collector=createCollector({serial,ownerId,accountId,sinceSeconds},notice=>{
    const text={'request:unlock':'Observed unlock request; waiting for its matching successful reply.','request:lock':'Observed lock request; waiting for its matching successful reply.','success:unlock':'Observed matching successful unlock reply.','success:lock':'Observed matching successful lock reply.','conflict':'Conflicting identities observed; refusing to save.'}[notice];
    if (text) console.log(text);
  });
  const outcomes=await Promise.allSettled(addresses.map(async(ip,index)=>{
    const mqtt=new SecureMqtt({credentials,instanceIp:ip,clientId:buildAppShapedClientId({appName:'eufy_security',uid:credentials.user_id??'',mqttUuid:mqttUuidFrom(`${openudid}-capture-${index}`)}),reconnectPeriod:0});
    clients.push(mqtt);mqtt.on('error',()=>{});mqtt.on('message',message=>collector.accept(message));
    try {await bounded(mqtt.connect(),15000,'Broker connect timed out.');const granted=await bounded(mqtt.subscribe([req,res]),10000,'Subscription timed out.');if(!granted.includes(req)||!granted.includes(res))throw new CaptureError('Request or response topic denied.');return true;}
    catch {await mqtt.disconnect().catch(()=>{});return false;}
  }));
  if (!outcomes.some(x=>x.status==='fulfilled' && x.value)) throw new CaptureError('No broker granted both configured-lock topics. No identity was saved.');
  console.log('LISTENING — 120 seconds. In Eufy unlock the CLOSED door, confirm movement, then LOCK it and confirm movement.');
  console.log('Do not open live video, operate other devices or use Home Assistant controls during this window.');
  const identity=await new Promise(resolve=>{
    const deadline=setTimeout(()=>{clearInterval(check);resolve(null);},120000);
    const check=setInterval(()=>{const result=collector.result();if(result){clearTimeout(deadline);clearInterval(check);resolve(result);}},250);
  });
  await cleanup();
  if (!identity) throw new CaptureError('No complete matching successful unlock/relock pair was captured. No identity was saved.');
  const confirmed=(await prompt('Did BOTH bolt movements physically occur, and is the door locked now? Type YES: ')).trim();
  if (confirmed!=='YES') throw new CaptureError('Physical confirmation was not given; no identity was saved.');
  mkdirSync(output,{recursive:true,mode:0o700});chmodSync(output,0o700);
  writeFileSync(resolve(output,'command-identity-private.json'),JSON.stringify({...identity,observedAt:Date.now()},null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('Saved privately: tools/identity-capture/private/command-identity-private.json');
  console.log('Copy its JSON only into your Home Assistant e330_identity setting. Never publish it.');
  console.log('The helper saved no password, login session, certificates or raw cloud packets.');
}
process.on('SIGINT',()=>{cleanup().finally(()=>process.exit(130));});
main().catch(async(error)=>{
  // Do not print SDK exception messages, which may contain account or device data.
  console.error(error instanceof CaptureError ? error.message : 'Cloud/SDK operation failed; no new identity saved. See the guide troubleshooting table.');
  await cleanup();process.exitCode=1;
});
