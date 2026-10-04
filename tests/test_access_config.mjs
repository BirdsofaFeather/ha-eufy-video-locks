import assert from 'node:assert/strict';
import { validateRepairConfig } from '../eufy_video_locks/repair-config.mjs';
import { parseCredentials,allowsHttp,hasCredential } from '../eufy_video_locks/bridge-access.mjs';
import { ingressAllowed,pairingPage } from '../eufy_video_locks/setup-ui.mjs';
const keys={version:1,httpToken:'a'.repeat(64),rtspPassword:'b'.repeat(64)};
assert.deepEqual(parseCredentials(JSON.stringify(keys)),keys);
for(const value of [{...keys,httpToken:'short'},{...keys,rtspPassword:keys.httpToken},{...keys,version:2}])assert.throws(()=>parseCredentials(JSON.stringify(value)));
const req={method:'GET',url:'/devices',headers:{},socket:{remoteAddress:'203.0.113.8'}};
assert.equal(allowsHttp(req,keys),false);
assert.equal(allowsHttp({...req,url:'/devices?token='+keys.httpToken},keys),false);
assert.equal(allowsHttp({...req,headers:{'x-forwarded-for':'127.0.0.1'}},keys),false);
assert.equal(hasCredential({...req,headers:{authorization:'Bearer '+keys.httpToken}},keys),true);
assert.equal(hasCredential({...req,headers:{authorization:'Bearer '+'c'.repeat(64)}},keys),false);
for(const ip of ['127.0.0.1','::1','::ffff:127.0.0.1']) {
 assert.equal(allowsHttp({...req,url:'/healthz',socket:{remoteAddress:ip}},keys),true);
 assert.equal(allowsHttp({...req,url:'/stream/fixture',socket:{remoteAddress:ip}},keys),true);
 assert.equal(allowsHttp({...req,socket:{remoteAddress:ip}},keys),false);
 assert.equal(allowsHttp({...req,url:'/stream/fixture',method:'POST',socket:{remoteAddress:ip}},keys),false);
}
assert(ingressAllowed('172.30.32.2'));assert(ingressAllowed('::ffff:172.30.32.2'));assert(!ingressAllowed('203.0.113.8'));
assert(!pairingPage('<script>alert(1)</script>',keys).includes('<script>'));
assert.equal(validateRepairConfig({}).allowControl,false);
for(const options of [{s330_serial:'bad'},{s330_serial:'T8530000000000000'},{s330_channel:256},{mqtt_host:'https://example.com'},{mqtt_fallback_ips:['invalid']},{e330_serial:'T8531000000000000',enable_control:true},{e330_identity:'invalid'}])assert.throws(()=>validateRepairConfig(options));
console.log('Private pairing, constant-size authentication, ingress isolation and configuration fail-closed tests passed.');
