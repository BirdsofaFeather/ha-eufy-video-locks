import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { videoProviderFor, isVerifiedDoorSummary } from "../eufy_video_locks/door-video.mjs";
for (const [sn, model] of [["T853000000000000","T8530"],["T853100000000000","T8531"]]) {
  const calls = [];
  const client = {
    getDevice: async (value) => {assert.equal(value,sn);return {model,has:(cap)=>["lock","video"].includes(cap)};},
    connectStation: async (value,signal) => {assert.equal(value,sn);assert.ok(signal instanceof AbortSignal);calls.push("connect");},
    mediaProviderFor: (value) => {assert.equal(value,sn);return {openReadable:async(options)=>{calls.push("media");assert.equal(options.powered,false);assert.equal(options.batteryBudgetMs,1000);return "feed";}};},
  };
  const provider = await videoProviderFor(client,sn);
  assert.deepEqual(calls,[]); // Inventory alone must not open a station/camera.
  assert.equal(await provider.openReadable({batteryBudgetMs:1000,powered:true}),"feed");
  assert.deepEqual(calls,["connect","media"]);
}
assert.equal(isVerifiedDoorSummary({sn:"T853100000000000",model:"T8531",capabilities:["lock"]}),true);
assert.equal(isVerifiedDoorSummary({sn:"other",model:"T8531",capabilities:["lock"]}),false);
assert.equal(isVerifiedDoorSummary({sn:"T853100000000000",model:"T8530",capabilities:["lock"]}),false);
assert.equal(isVerifiedDoorSummary({sn:"T853100000000000",model:"T8531",capabilities:[]}),false);
let touched=false;
const ordinary={openReadable:()=>{}};
assert.equal(await videoProviderFor({getDevice:async()=>({camera:()=>ordinary}),mediaProviderFor:()=>{touched=true}},"other"),ordinary);
assert.equal(touched,false);
for (const device of [{model:"T8531",has:()=>true},{model:"T8530",has:()=>true},{model:"T8531",has:()=>false}]) {
  const sn = device.model==="T8530"?"T853100000000000":"unlisted";
  assert.equal(await videoProviderFor({getDevice:async()=>device,mediaProviderFor:()=>{throw Error("unexpected provider")}},sn),undefined);
}
await assert.rejects(()=>videoProviderFor({getDevice:async()=>({model:"T8531",has:()=>true})},"T853100000000000"),/interfaces unavailable/);
const here=dirname(fileURLToPath(import.meta.url));
const fixture=mkdtempSync(join(tmpdir(),"eufy-video-test-"));
mkdirSync(join(fixture,"src"));mkdirSync(join(fixture,"node_modules/@mega-yfue/eufy-sdk"),{recursive:true});
writeFileSync(join(fixture,"node_modules/@mega-yfue/eufy-sdk/package.json"),JSON.stringify({version:"0.3.0"}));
for (const [source,target] of [["fixtures/src/http-routes.mjs","src/http-routes.mjs"],["fixtures/src/device-view.mjs","src/device-view.mjs"]])
  writeFileSync(join(fixture,target),readFileSync(join(here,source)));
const patched=spawnSync(process.execPath,[join(here,"../eufy_video_locks/patch-video.mjs")],{env:{...process.env,BRIDGE_PATCH_ROOT:fixture},encoding:"utf8"});
assert.equal(patched.status,0,patched.stderr);
for (const name of ["src/http-routes.mjs","src/device-view.mjs"])
  assert.equal(spawnSync(process.execPath,["--check",join(fixture,name)]).status,0);
const unchanged=readFileSync(join(fixture,"src/http-routes.mjs"),"utf8");
writeFileSync(join(fixture,"node_modules/@mega-yfue/eufy-sdk/package.json"),JSON.stringify({version:"99.0.0"}));
assert.notEqual(spawnSync(process.execPath,[join(here,"../eufy_video_locks/patch-video.mjs")],{env:{...process.env,BRIDGE_PATCH_ROOT:fixture}}).status,0);
assert.equal(readFileSync(join(fixture,"src/http-routes.mjs"),"utf8"),unchanged);
console.log("Door video target/capability guards, battery limit, deferred opening and ordinary cameras passed.");
const { configureFrontVideo, sendLegacyMedia } = await import('../eufy_video_locks/door-video.mjs');
const { createDecipheriv } = await import('node:crypto');
const sent=[];
const session={cfg:{stationSn:'T802100000000000'},connectAddress:{host:'test',port:1},level1Key:Buffer.alloc(16,7),seqNumber:65535,
 send:(_address,type,packet)=>{assert.deepEqual(type,Buffer.from([0xf1,0xd0]));sent.push(packet)},
 rsaModulus:()=> 'a'.repeat(256),sendCommand:(cmd,ch)=>sent.push([cmd,ch]),
 startLiveMedia:()=>{throw Error('unexpected default start')},stopLiveMedia:()=>{throw Error('unexpected default stop')}};
const route={session,parentSn:'T802100000000000',channel:0,homeBaseAttached:true};
let seenOptions;
const special={opts:{autoRealtime:false},p2p:{resolveSession:async(sn,options)=>{seenOptions=options;return route}}};
configureFrontVideo(special);
await special.p2p.resolveSession('T853000000000000',{waitLevel2:'soft',requireLevel2ForAttached:true});
assert.equal(seenOptions.waitLevel2,false);assert.equal(seenOptions.requireLevel2ForAttached,false);
session.startLiveMedia(0,'private-id',true);session.startLiveMedia(0,'private-id',true);session.stopLiveMedia(0,'private-id');
assert.equal(sent[0].readUInt16LE(8),1003);assert.equal(sent[0].readUInt16LE(10),272);assert.equal(sent[0][17],2);
assert.equal(sent[0].readUInt16BE(2),65535);assert.deepEqual(sent[1],[1139,0]);assert.equal(sent[2].readUInt16LE(8),1004);
for(const [packet,bytes] of [[sent[0],272],[sent[2],16]]){
 const d=createDecipheriv('aes-128-ecb',session.level1Key,null);d.setAutoPadding(false);
 const body=Buffer.concat([d.update(packet.subarray(20)),d.final()]);assert.equal(body.length,bytes);assert.equal(body.readUInt32LE(0),0);
 if(bytes===272)assert.equal(body.subarray(4,260).toString(),'a'.repeat(256));
}
assert.equal(session.seqNumber,1);
assert.throws(()=>sendLegacyMedia(session,1961,0),/route unavailable/);
assert.throws(()=>sendLegacyMedia(session,1003,1,'a'.repeat(256)),/route unavailable/);
assert.throws(()=>configureFrontVideo({opts:{autoRealtime:true},p2p:special.p2p}),/dedicated stream/);
const bad={opts:{autoRealtime:false},p2p:{resolveSession:async()=>({...route,parentSn:'other'})}};
configureFrontVideo(bad);await assert.rejects(()=>bad.p2p.resolveSession('T853000000000000',{requireLevel2ForAttached:true}),/chime\/channel changed/);
await special.p2p.resolveSession('T853100000000000',{waitLevel2:'soft',requireLevel2ForAttached:true});
assert.equal(seenOptions.waitLevel2,'soft');assert.equal(seenOptions.requireLevel2ForAttached,true);
console.log('Front-only legacy encrypted video start/keepalive/stop and control-client exclusion passed.');
