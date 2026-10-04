import { getRepairConfig } from './repair-config.mjs';
const backTarget = () => getRepairConfig().backSerial;
// Modified for configurable public distribution, October 2026.
// Offline-prepared candidate. No installation, connection or automatic execution.
// Matches the confirmed Owner-app settings GET capture. Resident capture is unresolved.
import {createDecipheriv} from 'node:crypto';

function exactKeys(object, expected) {
  return object && JSON.stringify(Object.keys(object).sort())===JSON.stringify([...expected].sort());
}
function frame(hex, response) {
  if(typeof hex!=='string'||!/^(?:[a-f0-9]{2})+$/i.test(hex)||hex.length>4096)throw new Error('Invalid settings frame');
  const bytes=Buffer.from(hex,'hex');
  if(bytes.length<26||bytes[0]!==255||bytes[1]!==9||bytes.readUInt16LE(2)!==bytes.length||bytes[4]!==3||bytes[5]!==0||bytes[6]!==2||bytes.readUInt16BE(7)!==(response?0x4835:0x4035)||(bytes.length-10)%16||bytes.reduce((a,b)=>a^b,0))throw new Error('Settings-only frame guard refused request/reply');
  return bytes;
}
function decrypt(bytes, owner, time) {
  const tail=Buffer.alloc(4);tail.writeUInt32BE(time);
  const key=Buffer.concat([Buffer.from(owner.slice(-12),'ascii'),tail]);
  const iv=Buffer.alloc(16);Buffer.from(backTarget(),'ascii').copy(iv);
  const d=createDecipheriv('aes-128-cbc',key,iv);
  return Buffer.concat([d.update(bytes.subarray(9,-1)),d.final()]);
}
export function validateQuery(topic, envelope, owner) {
  if(topic!==`cmd/eufy_security/T8531/${backTarget()}/req`)throw new Error('Wrong settings topic');
  const object=JSON.parse(envelope), payload=JSON.parse(object.payload);
  if(object.head?.cmd!==9||object.head?.cmd_status!==2||!exactKeys(payload,['account_id','device_sn','trans'])||payload.account_id!==owner||payload.device_sn!==backTarget())throw new Error('Owner-app cloud envelope guard refused request');
  const inner=JSON.parse(Buffer.from(payload.trans,'base64').toString());
  if(!exactKeys(inner,['cmd','mChannel','mValue3','payload'])||inner.cmd!==1940||inner.mChannel!==0||inner.mValue3!==0||!exactKeys(inner.payload,['apiCommand','lock_payload','seq_num','time'])||inner.payload.apiCommand!==6016||!Number.isInteger(inner.payload.time)||inner.payload.time<0||inner.payload.time>0xffffffff||!Number.isInteger(inner.payload.seq_num))throw new Error('Settings-only transport guard refused request');
  const bytes=frame(inner.payload.lock_payload,false);
  const plain=decrypt(bytes,owner,inner.payload.time);
  const identity=Buffer.from(owner,'ascii');
  if(plain[0]!==161||plain[1]!==4||plain[6]!==162||plain[7]!==identity.length||!plain.subarray(8,8+identity.length).equals(identity)||!plain.subarray(8+identity.length).every(b=>b===0))throw new Error('Settings GET plaintext guard refused request');
  return {apiCommand:6016,opcode:53,bytes:bytes.length,timeType:'number',cloudIdentity:'owner',bleIdentity:'owner'};
}
export function createSettingsReader(eufy,mqtt) {
  let used=false;
  return async()=>{
    if(used)throw new Error('This diagnostic permits one settings GET only');
    used=true;
    const dev=eufy.registry.list().find(d=>d.model==='T8531'&&d.sn===backTarget());
    const owner=dev?.raw?.member?.admin_user_id;
    if(typeof owner!=='string'||!/^[a-f0-9]{40}$/i.test(owner)||typeof eufy.mqtt?.fetchFf09SettingsGetReply!=='function')throw new Error('Target settings identity/helper unavailable');
    let publishes=0,request;
    const listeners=new Map();
    const view={id:mqtt.id,
      on(event,fn){
        if(event!=='message')throw new Error('Unsupported diagnostic event');
        const filtered=m=>{
          if(m.topic!==`cmd/eufy_security/T8531/${backTarget()}/res`)return;
          try{
            const payload=typeof m.raw?.payload==='string'?JSON.parse(m.raw.payload):m.raw?.payload;
            const inner=JSON.parse(Buffer.from(payload.trans,'base64').toString());
            if(inner.cmd!==1940||inner.payload?.dev_sn!==backTarget())return;
            frame(inner.payload.lock_payload,true);
          }catch{return;}
          fn(m);
        };
        listeners.set(fn,filtered);mqtt.on(event,filtered);
      },
      off(event,fn){const filtered=listeners.get(fn);if(filtered){mqtt.off(event,filtered);listeners.delete(fn);}},
      async publish(topic,envelope,options){
        if(publishes||options?.qos!==1)throw new Error('One GET publish only');
        request=validateQuery(topic,envelope,owner);publishes++;
        await mqtt.publish(topic,envelope,options);
      }
    };
    const start=Date.now();
    try{
      const reply=await eufy.mqtt.fetchFf09SettingsGetReply(view,`cmd/eufy_security/T8531/${backTarget()}/req`,backTarget(),{adminUserId:owner,deviceSn:backTarget()},'observed-broker');
      const plain=decrypt(frame(reply.lockPayload,true),owner,reply.keyTime);
      if(!plain.length)throw new Error('Empty settings response');
      const fields=[];
      for(let offset=1;offset+2<=plain.length&&plain[offset]!==0;){
        const tag=plain[offset],length=plain[offset+1];
        if(offset+2+length>plain.length)throw new Error('Truncated settings response');
        fields.push({tag,length});offset+=2+length;
      }
      return {matchedReply:true,statusByte:plain[0],fieldShapes:fields,request,publishes,elapsedMs:Date.now()-start,actuatorCommandsSent:0};
    }finally{for(const filtered of listeners.values())mqtt.off('message',filtered);}
  };
}
