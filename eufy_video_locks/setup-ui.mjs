// Home Assistant ingress only; never expose pairing keys on the raw bridge port.
import { createServer } from 'node:http';
import { hostname } from 'node:os';
export function ingressAllowed(address) {
  return address === '172.30.32.2' || address === '::ffff:172.30.32.2';
}
export function pairingPage(host, keys) {
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Eufy Video Locks setup</title>
  <style>body{font:17px system-ui;background:#f5f7fa;color:#172331;margin:0;padding:32px}main{max-width:760px;margin:auto;background:white;border:1px solid #dde3ea;border-radius:20px;padding:28px}h1{margin-top:0}label{display:block;margin:20px 0 6px;font-weight:600}input{width:100%;box-sizing:border-box;font:14px monospace;border:1px solid #c4ced9;border-radius:8px;padding:12px}summary{cursor:pointer;font-weight:600;padding:14px 0}.hint{color:#596778;line-height:1.6}</style></head><body><main>
  <h1>Eufy Video Locks</h1><p class="hint">Install the matching integration through HACS, restart Home Assistant, then add Eufy Video Locks under Settings → Devices &amp; services. Copy these pairing values into its setup form.</p>
  <label>Bridge hostname</label><input readonly value="${escape(host)}"><p>Bridge port: <strong>3000</strong> · Video port: <strong>8554</strong></p>
  <details><summary>Show private pairing keys</summary><label>Bridge access token</label><input readonly value="${escape(keys.httpToken)}"><label>Video password</label><input readonly value="${escape(keys.rtspPassword)}"></details>
  <p class="hint">Keep pairing keys private. Configure your device serials in the app Configuration tab. Control is off by default. Enable it only for the devices you intend to operate. Import your own E330 identity privately before enabling E330 control.</p>
  </main></body></html>`;
}
export async function startSetupUi(keys, { port = 8099, host } = {}) {
  // Supervisor sets the container UTS hostname to its published DNS hostname.
  // Reading it locally requires no Supervisor token or API privilege.
  host ??= hostname();
  const server = createServer((req, res) => {
    if (!ingressAllowed(req.socket.remoteAddress)) { res.writeHead(403); res.end('Home Assistant ingress required'); return; }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    res.end(pairingPage(host, keys));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  return server;
}
