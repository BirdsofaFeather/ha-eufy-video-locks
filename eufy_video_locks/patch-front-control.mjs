// Modified for configurable public distribution, October 2026.
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.BRIDGE_PATCH_ROOT || '/app';
const pkg=root+'/node_modules/@mega-yfue/eufy-sdk';
if(JSON.parse(readFileSync(pkg+'/package.json','utf8')).version!=='0.3.0')
  throw Error('Review S330 control against the installed SDK');
const path=pkg+'/dist/index.js';const source=readFileSync(path,'utf8');
const before='  async sendFf09Actuate(sn, cmd) {\n    const resolved = await this.resolveSession(sn, { waitLevel2: true });';
if(source.split(before).length!==2 || source.includes('trySendFrontDoorActuation'))
  throw Error('Unexpected SDK actuation source; no files overwritten');
const after='  async sendFf09Actuate(sn, cmd) {\n    if (await trySendFrontDoorActuation(this, sn, cmd)) return;\n    const resolved = await this.resolveSession(sn, { waitLevel2: true });';
const next='import { trySendFrontDoorActuation } from "../../../../src/front-control.mjs";\n'+source.replace(before,after);
writeFileSync(path,next);
