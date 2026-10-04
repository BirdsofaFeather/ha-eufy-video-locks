// Modified for configurable public distribution, October 2026.
import {readFileSync, writeFileSync} from 'node:fs';
const root = process.env.BRIDGE_PATCH_ROOT || '/app';
const pkg = JSON.parse(readFileSync(root+'/node_modules/@mega-yfue/eufy-sdk/package.json','utf8'));
if(pkg.version !== '0.3.0') throw Error('Review S330 status against the installed SDK');
const path = root+'/src/device-view.mjs';
let source=readFileSync(path,'utf8');
function replaceOnce(anchor, replacement) {
  if(source.split(anchor).length !== 2) throw Error('Unexpected device-view status anchor');
  source=source.replace(anchor,replacement);
}
if(source.includes('createS330Status')) throw Error('Status patch already applied');
replaceOnce('  const { eufy } = ctx;', '  const { eufy } = ctx;\n  const applyS330Status = createS330Status(eufy);');
replaceOnce('    return out;', '    return applyS330Status(dev, out);');
source='import { createS330Status } from "./s330-status.mjs";\n'+source;
writeFileSync(path,source);
