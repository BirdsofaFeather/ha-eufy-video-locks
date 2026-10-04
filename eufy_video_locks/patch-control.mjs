// Modified for configurable public distribution, October 2026.
import fs from 'node:fs';
const root=process.env.BRIDGE_PATCH_ROOT || '/app';
const pkg=JSON.parse(fs.readFileSync(root+'/node_modules/@mega-yfue/eufy-sdk/package.json','utf8'));
if(pkg.version!=='0.3.0')throw new Error('Unverified SDK version');
const file=root+'/src/ws-server.mjs';let text=fs.readFileSync(file,'utf8');const anchor='  const { cfg, eufy, SCHEMA_VERSION, DEBUG, dbg } = ctx;';
if(text.split(anchor).length!==2||text.includes('installBackDoorCloudRoute'))throw new Error('Unexpected bridge source');
text="import {installBackDoorCloudRoute} from './back-cloud-control.mjs';\n"+text.replace(anchor,anchor+'\n  installBackDoorCloudRoute(eufy);');fs.writeFileSync(file,text);
console.log('Back Door cloud route installed; other device routes and SDK unchanged.');
