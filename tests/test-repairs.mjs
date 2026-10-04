import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'eufy-public-tests-'));
const identity={target:'T853100000000000',adminUserId:'0123456789abcdef0123456789abcdef01234567',cloudAccountId:'0123456789abcdef0123456789abcdef01234567',username:'Alice',shortUserId:'1234'};
const options={s330_serial:'T853000000000000',s330_chime_serial:'T802100000000000',e330_serial:identity.target,e330_identity:JSON.stringify(identity),enable_control:true};
const path=join(temp,'options.json');writeFileSync(path,JSON.stringify(options));
try {
 for(const name of ['front_control','status','video','back_control','access_config']) {
   const run=spawnSync(process.execPath,[new URL(`test_${name}.mjs`,import.meta.url).pathname],{stdio:'inherit',env:{...process.env,EUFY_LOCK_OPTIONS_FILE:path}});
   if(run.status!==0)process.exitCode=1;
 }
} finally {rmSync(temp,{recursive:true,force:true});}
