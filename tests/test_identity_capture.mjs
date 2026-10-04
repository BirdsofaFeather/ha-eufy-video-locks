import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {decodeMessage,createCollector} from '../tools/identity-capture/decode.mjs';
// All identities and frames below are synthetic; no real capture is checked in.
const serial='T853100000000000', ownerId='a'.repeat(40), accountId='b'.repeat(40), start=1900000000;
const context={serial,ownerId,accountId,sinceSeconds:start,nowSeconds:start+15};
const expected={target:serial,adminUserId:ownerId,cloudAccountId:accountId,username:'Example',shortUserId:'1234'};
function tlv(tag,b){return Buffer.concat([Buffer.from([tag,b.length]),b]);}
function message(direction,time=start+1,{reply=false,status=0,apiCommand=6018,id=ownerId,name='Example',short='1234',cloudAccount=accountId,otherSerial=serial,hexTime=false}={}) {
  const plain=reply ? Buffer.from([status&255]) : Buffer.concat([tlv(161,Buffer.alloc(4)),tlv(162,Buffer.from(id)),tlv(163,Buffer.from([direction])),tlv(164,Buffer.from(name)),tlv(165,Buffer.from(short,'hex'))]);
  const tail=Buffer.alloc(4);tail.writeUInt32BE(time);const iv=Buffer.alloc(16);Buffer.from(serial).copy(iv);
  const cipher=createCipheriv('aes-128-cbc',Buffer.concat([Buffer.from(ownerId.slice(-12)),tail]),iv);
  const encrypted=Buffer.concat([cipher.update(plain),cipher.final()]);
  const frame=Buffer.concat([Buffer.from([255,9,0,0,3,0,2,reply?0x48:0x40,35]),encrypted,Buffer.alloc(1)]);
  frame.writeUInt16LE(frame.length,2);frame[frame.length-1]=frame.subarray(0,-1).reduce((a,b)=>a^b,0);
  const trans={cmd:1940,payload:{time:hexTime?time.toString(16):time,dev_sn:otherSerial,apiCommand,lock_payload:frame.toString('hex')}};
  return {topic:`cmd/eufy_security/T8531/${otherSerial}/${reply?'res':'req'}`,raw:{payload:JSON.stringify({device_sn:otherSerial,account_id:cloudAccount,trans:Buffer.from(JSON.stringify(trans)).toString('base64')})}};
}
assert.deepEqual(decodeMessage(message(1),context).identity,expected);
assert.equal(decodeMessage(message(0,start+2,{hexTime:true}),context).direction,'lock');
assert.equal(decodeMessage(message(1,start+1,{reply:true}),context).kind,'success');
for (const opts of [{apiCommand:6016},{id:'c'.repeat(40)},{name:'\u0001Example'},{short:'12'.repeat(17)},{cloudAccount:'c'.repeat(40)},{otherSerial:'T853000000000000'},{reply:true,status:1}]) assert.equal(decodeMessage(message(1,start+1,opts),context),null);
assert.equal(decodeMessage(message(1,start-1),context),null);
assert.equal(decodeMessage(message(1,start+21),context),null);
const corrupt=message(1);const o=JSON.parse(corrupt.raw.payload),t=JSON.parse(Buffer.from(o.trans,'base64'));t.payload.lock_payload=t.payload.lock_payload.slice(0,-2)+'ff';o.trans=Buffer.from(JSON.stringify(t)).toString('base64');corrupt.raw.payload=JSON.stringify(o);assert.equal(decodeMessage(corrupt,context),null);
const collector=createCollector(context);const accept=m=>collector.accept(m,start+15);
accept(message(1,start+1,{reply:true}));assert.equal(collector.result(),null); // unsolicited response
accept(message(1));assert.equal(collector.result(),null); // request alone
accept(message(1,start+1,{reply:true}));assert.equal(collector.result(),null); // unlock alone
accept(message(0,start+2));accept(message(0,start+3,{reply:true}));assert.equal(collector.result(),null); // unrelated timestamp
accept(message(0,start+2,{reply:true}));assert.deepEqual(collector.result(),expected);
accept(message(0,start+4,{name:'Different'}));assert.equal(collector.result(),null); // mixed identities refused
const noOuterAccount=message(1,start+1,{reply:true});const p=JSON.parse(noOuterAccount.raw.payload);delete p.account_id;delete p.device_sn;noOuterAccount.raw.payload=JSON.stringify(p);assert.equal(decodeMessage(noOuterAccount,context).kind,'success');
console.log('Passed identity extraction, both directions, owner/account/device/frame/time guards, successful reply correlation, no save for incomplete/conflicting pairs.');
