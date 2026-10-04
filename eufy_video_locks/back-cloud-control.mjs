import { getRepairConfig } from './repair-config.mjs';
const backTarget = () => getRepairConfig().backSerial;
// Modified for configurable public distribution, October 2026.
import {SecureMqtt,buildAppShapedClientId,mqttUuidFrom} from '@mega-yfue/eufy-sdk';
import {resolve4} from 'node:dns/promises';
import {createDecipheriv} from 'node:crypto';
import {createSettingsReader} from './read-settings.mjs';

const requestTopic = () => `cmd/eufy_security/T8531/${backTarget()}/req`;
const responseTopic = () => requestTopic().replace('/req', '/res');
export function validateIdentity(identity,dev,userId){
 if(identity?.target!==backTarget()||dev?.model!=='T8531'||dev.sn!==backTarget()||identity.adminUserId!==dev.raw?.member?.admin_user_id||![identity.adminUserId,userId].includes(identity.cloudAccountId)||!/^[a-f0-9]{40}$/i.test(identity.adminUserId)||! /^[\x20-\x7e]{1,64}$/.test(identity.username)||! /^(?:[a-f0-9]{2}){1,16}$/i.test(identity.shortUserId))throw new Error('Captured Back Door command identity is invalid');
}
function inner(raw){const payload=typeof raw?.payload==='string'?JSON.parse(raw.payload):raw?.payload;return {payload,trans:JSON.parse(Buffer.from(payload.trans,'base64').toString())};}
function decrypt(hex,time,owner,opcode){
 if(typeof hex!=='string'||!/^(?:[0-9a-f]{2})+$/i.test(hex)||hex.length>4096)throw new Error('Invalid cloud command frame');
 const b=Buffer.from(hex,'hex');if(b.length<26||b[0]!==255||b[1]!==9||b.readUInt16LE(2)!==b.length||b[4]!==3||b[5]!==0||b[6]!==2||b.readUInt16BE(7)!==opcode||b.reduce((x,v)=>x^v,0))throw new Error('Cloud command frame failed validation');
 const tail=Buffer.alloc(4);tail.writeUInt32BE(time);const iv=Buffer.alloc(16);Buffer.from(backTarget()).copy(iv);const d=createDecipheriv('aes-128-cbc',Buffer.concat([Buffer.from(owner.slice(-12)),tail]),iv);return Buffer.concat([d.update(b.subarray(9,-1)),d.final()]);
}
function fields(plain){const out=new Map();for(let offset=0;offset+2<=plain.length&&plain[offset]!==0;){const tag=plain[offset],length=plain[offset+1];if(offset+2+length>plain.length||out.has(tag))throw new Error('Invalid command TLV');out.set(tag,plain.subarray(offset+2,offset+2+length));offset+=2+length;}return out;}
export function wrapActuator(mqtt,identity,engage,outcome){
 let keyTime,publishes=0;const listeners=new Map();
 const accept=message=>{
  if(message.topic!==responseTopic()||keyTime===undefined)return false;
  try{const {trans}=inner(message.raw);const p=trans.payload;const t=typeof p.time==='number'?p.time:Number.parseInt(p.time,16);if(trans.cmd!==1940||p.dev_sn!==backTarget()||t!==keyTime)return false;const plain=decrypt(p.lock_payload,t,identity.adminUserId,0x4823);if(!plain.length)return false;outcome.returnCode=plain.readInt8(0);outcome.correlatedReply=true;return true;}catch{return false;}
 };
 return {id:mqtt.id,
  on(event,fn){if(event!=='message')throw new Error('Unsupported command event');const filtered=m=>{if(accept(m))fn(m);};listeners.set(fn,filtered);mqtt.on(event,filtered);},
  off(event,fn){const filtered=listeners.get(fn);if(filtered){mqtt.off(event,filtered);listeners.delete(fn);}},
  async subscribeDevice(dev){if(dev.sn!==backTarget()||dev.model!=='T8531')throw new Error('Wrong cloud command target');await mqtt.subscribe([responseTopic()]);},
  async publish(topic,envelope,options){
   if(publishes||topic!==requestTopic()||options?.qos!==1)throw new Error('Only one Back Door actuator publish permitted');
   const object=JSON.parse(envelope),{payload,trans}=inner(object),p=trans.payload;
   if(object.head?.cmd!==9||object.head?.cmd_status!==2||payload.device_sn!==backTarget()||trans.cmd!==1940||trans.mChannel!==0||trans.mValue3!==0||p.apiCommand!==6018||!Number.isInteger(p.time)||p.time<0||p.time>0xffffffff)throw new Error('Wrong cloud command envelope');
   const tlv=fields(decrypt(p.lock_payload,p.time,identity.adminUserId,0x4023));
   if(tlv.size!==5||tlv.get(161)?.length!==4||tlv.get(162)?.toString('ascii')!==identity.adminUserId||tlv.get(163)?.length!==1||tlv.get(163)?.[0]!== (engage?0:1)||tlv.get(164)?.toString('ascii')!==identity.username||tlv.get(165)?.toString('hex')!==identity.shortUserId.toLowerCase())throw new Error('Command identity/direction does not match the captured app');
   payload.account_id=identity.cloudAccountId;object.payload=JSON.stringify(payload);keyTime=p.time;publishes++;outcome.actuatorPublishes=publishes;
   await mqtt.publish(topic,JSON.stringify(object),options);
  },
  async disconnect(){for(const fn of listeners.values())mqtt.off('message',fn);listeners.clear();await mqtt.disconnect();}
 };
}
export function installBackDoorCloudRoute(eufy,injected={}){
 const Mqtt=injected.Mqtt??SecureMqtt,lookup=injected.lookup??resolve4,reader=injected.reader??createSettingsReader;
 const originalRoute=eufy.routeCommand.bind(eufy),originalEnsure=eufy.mqtt.ensureSecurityMqttFor.bind(eufy.mqtt);
 if (!backTarget()) return;
 const identity = injected.identity ?? getRepairConfig().backIdentity;
 let active;
 eufy.mqtt.ensureSecurityMqttFor=async dev=>{
  if(dev.sn!==backTarget()||!active)return originalEnsure(dev);
  const creds=await eufy.mega.getUserMqttInfo('eufy_security');
  const discovered=await lookup(getRepairConfig().mqttHost).catch(()=>[]);
  const candidates=[...new Set([...discovered, ...getRepairConfig().mqttFallbackIps])].filter(ip=>/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)).slice(0,6);
  for(const ip of candidates){
   const mqtt=new Mqtt({credentials:creds,instanceIp:ip,clientId:buildAppShapedClientId({appName:'eufy_security',uid:creds.user_id??'',mqttUuid:mqttUuidFrom(eufy.mega.openudid+'-back-cloud-control')}),reconnectPeriod:0});mqtt.on('error',()=>{});
   try{await mqtt.connect();await mqtt.subscribe([responseTopic()]);const read=await reader(eufy,mqtt)();if(!read.matchedReply||read.statusByte!==0)throw new Error('Settings read was rejected');active.instanceIp=ip;return{mqtt:wrapActuator(mqtt,identity,active.engage,active),instanceIp:ip};}
   catch{await mqtt.disconnect().catch(()=>{});}
  }
  throw new Error('No validated Back Door cloud settings response; no actuator command sent');
 };
 eufy.routeCommand=async(sn,cmd)=>{
  if(sn!==backTarget()||cmd.kind!=='ff09-actuate')return originalRoute(sn,cmd);
  const dev=eufy.registry.require(sn);validateIdentity(identity,dev,eufy.mega.auth?.userId);
  if(typeof cmd.engage!=='boolean'||cmd.deviceSn!==backTarget()||active)throw new Error('Back Door cloud command guard refused request');
  if (!getRepairConfig().allowControl) throw Error("Enable control in app configuration after validating this device");
  active={engage:cmd.engage};
  try{await eufy.mqtt.dispatchFf09Actuate(sn,{...cmd,adminUserId:identity.adminUserId,username:identity.username,shortUserId:identity.shortUserId});if(!active.correlatedReply)throw new Error('Back Door actuator response timed out; physical result unconfirmed');if(active.returnCode!==0)throw new Error('Back Door rejected cloud command with code '+active.returnCode);console.log('[back-cloud-control] '+JSON.stringify({direction:cmd.engage?'lock':'unlock',correlatedReply:true,returnCode:active.returnCode,actuatorPublishes:active.actuatorPublishes}));}
  finally{active=undefined;}
 };
}
