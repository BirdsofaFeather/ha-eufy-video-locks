// Reconstruct the public Docker overlay offline and exercise the real SDK with mocks.
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,readFileSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const repo=resolve(new URL('..',import.meta.url).pathname);
const root=join(repo,'.test-runtime');
rmSync(root,{recursive:true,force:true});mkdirSync(join(root,'src'),{recursive:true});
cpSync(join(repo,'tests/fixtures'),root,{recursive:true});
const sdk=join(root,'node_modules/@mega-yfue/eufy-sdk');
cpSync(join(repo,'.test-sdk/package'),sdk,{recursive:true,filter:p=>!p.split('/').includes('node_modules')});
symlinkSync(join(repo,'.test-sdk/package/node_modules'),join(sdk,'node_modules'),'dir');
for(const name of readdirSync(join(repo,'eufy_video_locks')).filter(n=>n.endsWith('.mjs')))
 cpSync(join(repo,'eufy_video_locks',name),join(root,'src',name));
cpSync(join(root,'src/streams-battery-safe.mjs'),join(root,'streams.mjs'));
cpSync(join(root,'src/stream-lifecycle.mjs'),join(root,'stream-lifecycle.mjs'));
const run=(args,env={})=>{
 const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});
 assert.equal(r.status,0,'Offline battery test command failed');
};
const env={BRIDGE_PATCH_ROOT:root};
for(const name of ['control','access','video','status','front-control','sdk-version','battery-safety'])
 run([join(repo,'eufy_video_locks',`patch-${name}.mjs`)],env);
const files=['src/http-routes.mjs','src/watchdog.mjs','node_modules/@mega-yfue/eufy-sdk/dist/index.js'];
for(const name of ['streams.mjs','stream-lifecycle.mjs','go2rtc-config.mjs',...readdirSync(join(root,'src')).filter(n=>n.endsWith('.mjs')).map(n=>'src/'+n),files[2]])
 run(['--check',join(root,name)]);
const before=files.map(n=>readFileSync(join(root,n),'utf8'));
const refused=spawnSync(process.execPath,[join(repo,'eufy_video_locks/patch-battery-safety.mjs')],{env:{...process.env,...env}});
assert.notEqual(refused.status,0);assert.deepEqual(files.map(n=>readFileSync(join(root,n),'utf8')),before);
const options={s330_serial:'T853000000000000',s330_chime_serial:'T802100000000000',e330_serial:'T853100000000000',enable_control:false};
const optionsFile=join(root,'options.json');writeFileSync(optionsFile,JSON.stringify(options));
run(['--test',join(repo,'tests/test_battery_safety.mjs')],{EUFY_LOCK_OPTIONS_FILE:optionsFile});
console.log('Complete public overlay, syntax, repeat-patch refusal and real SDK battery/lifecycle tests passed.');
