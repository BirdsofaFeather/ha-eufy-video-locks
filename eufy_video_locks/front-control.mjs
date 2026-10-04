import { getRepairConfig } from './repair-config.mjs';
const frontSerial = () => getRepairConfig().frontSerial;
const frontChime = () => getRepairConfig().frontChime;
const frontChannel = () => getRepairConfig().frontChannel;
// Modified for configurable public distribution, October 2026.
// Restore only the historically verified S330/T8021 command route. Never act
// during import, discovery or status reads; only a caller's explicit intent.


export async function trySendFrontDoorActuation(router,sn,cmd) {
  if (!frontSerial() || sn !== frontSerial()) return false;
  if (!getRepairConfig().allowControl) throw Error("Enable control in app configuration after validating this device");
  const dev=await router.deviceFor(sn);
  if(dev.model!=='T8530' || cmd.deviceSn!==frontSerial() || typeof cmd.engage!=='boolean' ||
     typeof cmd.adminUserId!=='string' || !cmd.adminUserId.trim() ||
     !['string','number'].includes(typeof cmd.shortUserId) || !String(cmd.shortUserId).trim() ||
     typeof cmd.username!=='string') throw Error('S330 command identity is invalid; nothing sent');
  const route=await router.resolveSession(sn,{waitLevel2:false,requireLevel2ForAttached:false});
  const {session,channel}=route;
  if(route.parentSn!==frontChime() || channel!==frontChannel() || route.homeBaseAttached!==true ||
     session.cfg?.stationSn!==frontChime() || !Buffer.isBuffer(session.level1Key) ||
     session.level1Key.length!==16 || typeof session.sendSetPayload!=='function')
    throw Error('S330 encrypted chime route changed; nothing sent');
  // Match the previous successful T8530 test and bropat Station.lockDevice's
  // isLockWifiVideo branch: encrypted SET_PAYLOAD carrying inner command 1961.
  // Do not use the E330 ff09/cloud format, send an unencrypted payload, retry the
  // operation or optimistically change the state. Actual events report the bolt.
  session.sendSetPayload(1961,{
    shortUserId:cmd.shortUserId,slOperation:cmd.engage?1:0,
    userId:cmd.adminUserId,userName:cmd.username,
  },{accountId:cmd.adminUserId,channel});
  return true;
}
