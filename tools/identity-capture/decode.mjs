// Capture decoder: no network operations, credentials, logging or actuator commands.
import {createDecipheriv} from 'node:crypto';
const idPattern = /^[a-f0-9]{40}$/i;
export function decodeMessage(message, context) {
  const {serial, ownerId, accountId, sinceSeconds, nowSeconds} = context;
  if (!/^T8531[A-Z0-9]{11}$/.test(serial) || !idPattern.test(ownerId) || !idPattern.test(accountId)) return null;
  const req = `cmd/eufy_security/T8531/${serial}/req`;
  if (![req, req.replace('/req','/res')].includes(message.topic)) return null;
  try {
    const raw = message.raw;
    const outer = typeof raw?.payload === 'string' ? JSON.parse(raw.payload) : raw?.payload;
    const request = message.topic === req;
    if (!outer || (outer.device_sn !== undefined && outer.device_sn !== serial)) return null;
    if (request && (outer.device_sn !== serial || ![ownerId, accountId].includes(outer.account_id))) return null;
    if (typeof outer.trans !== 'string' || outer.trans.length > 12000) return null;
    const trans = JSON.parse(Buffer.from(outer.trans,'base64').toString('utf8'));
    const p = trans.payload;
    if (trans.cmd !== 1940 || !p || (p.dev_sn !== undefined && p.dev_sn !== serial)) return null;
    const time = typeof p.time === 'number' ? p.time : typeof p.time === 'string' && /^(?:0x)?[a-f0-9]{1,8}$/i.test(p.time) ? parseInt(p.time,16) : NaN;
    if (!Number.isInteger(time) || time < 0 || time > 0xffffffff || time < sinceSeconds || time > nowSeconds + 5 || nowSeconds - time > 120) return null;
    if (typeof p.lock_payload !== 'string' || !/^(?:[a-f0-9]{2}){26,2048}$/i.test(p.lock_payload)) return null;
    const b = Buffer.from(p.lock_payload,'hex');
    if (b[0] !== 255 || b[1] !== 9 || b.readUInt16LE(2) !== b.length || b[4] !== 3 || b[5] !== 0 || b[6] !== 2 || b.readUInt16BE(7) !== (request ? 0x4023 : 0x4823) || b.reduce((x,v)=>x^v,0)) return null;
    const tail = Buffer.alloc(4); tail.writeUInt32BE(time);
    const iv = Buffer.alloc(16); Buffer.from(serial,'ascii').copy(iv);
    const cipher = createDecipheriv('aes-128-cbc',Buffer.concat([Buffer.from(ownerId.slice(-12),'ascii'),tail]),iv);
    const plain = Buffer.concat([cipher.update(b.subarray(9,-1)),cipher.final()]);
    if (!request) return plain.length && plain.readInt8(0) === 0 ? {kind:'success',time} : null;
    if (p.apiCommand !== 6018) return null;
    const fields = new Map(); let pos = 0;
    while (pos < plain.length) {
      if (plain[pos] === 0 && plain.subarray(pos).every(x=>x===0)) break;
      if (pos+2 > plain.length) return null;
      const tag=plain[pos], length=plain[pos+1];
      if (!length || pos+2+length > plain.length || fields.has(tag)) return null;
      fields.set(tag,plain.subarray(pos+2,pos+2+length)); pos += 2+length;
    }
    if (fields.size !== 5 || fields.get(161)?.length !== 4 || fields.get(162)?.toString('ascii') !== ownerId || fields.get(163)?.length !== 1 || ![0,1].includes(fields.get(163)[0])) return null;
    const nameBytes=fields.get(164), shortBytes=fields.get(165);
    if (!nameBytes || nameBytes.some(x=>x<32 || x>126) || nameBytes.length>64 || !shortBytes || shortBytes.length>16) return null;
    return {kind:'request',time,direction:fields.get(163)[0] === 1 ? 'unlock' : 'lock',identity:{target:serial,adminUserId:ownerId,cloudAccountId:outer.account_id,username:nameBytes.toString('ascii'),shortUserId:shortBytes.toString('hex')}};
  } catch { return null; }
}

export function createCollector(context, notify=()=>{}) {
  const pending = new Map(), succeeded = new Set();
  let identity, conflict=false;
  return {
    accept(message, nowSeconds=Math.floor(Date.now()/1000)) {
      const result=decodeMessage(message,{...context,nowSeconds});
      if (!result || conflict) return;
      if (result.kind==='request') {
        if (identity && JSON.stringify(identity)!==JSON.stringify(result.identity)) {conflict=true;notify('conflict');return;}
        identity=result.identity;pending.set(result.time,result.direction);notify(`request:${result.direction}`);
      } else if (pending.has(result.time)) {
        const direction=pending.get(result.time);pending.delete(result.time);succeeded.add(direction);notify(`success:${direction}`);
      }
    },
    result() {return !conflict && succeeded.has('unlock') && succeeded.has('lock') ? {...identity} : null;}
  };
}
