// Modified for configurable public distribution, October 2026.
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.BRIDGE_PATCH_ROOT || '/app';
const pkg=JSON.parse(readFileSync(root+'/node_modules/@mega-yfue/eufy-sdk/package.json','utf8'));
if(pkg.version!=='0.3.0')throw Error('Unverified SDK metadata version');
const p=root+'/src/http-routes.mjs';let s=readFileSync(p,'utf8');
const a='export function createHttpHandler(ctx) {';
const b='        schemaVersion: SCHEMA_VERSION,';
if(s.split(a).length!==2||s.split(b).length!==2||s.includes('sdkVersion: installedSdkVersion'))throw Error('Unexpected SDK health metadata source');
s=s.replace(a,a+'\n  const installedSdkVersion = JSON.parse(fs.readFileSync(new URL("../node_modules/@mega-yfue/eufy-sdk/package.json", import.meta.url), "utf8")).version;');
s=s.replace(b,b+'\n        sdkVersion: installedSdkVersion,');
writeFileSync(p,s);
