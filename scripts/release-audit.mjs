import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const roots = ['src', 'src-tauri/src', 'tests', 'mobile/src', 'cloud/src', 'shared'];
const files = ['package.json', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json', 'index.html', 'README.md'];
function walk(root) { for (const entry of readdirSync(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) walk(path); else if (/\.(tsx?|rs|mjs|css)$/.test(path)) files.push(path); } }
roots.forEach(walk);
let failures = 0;
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  // Report paths and counts only. Never print any matching value.
  const secrets = text.match(/AIza[\w-]{30,}/g)?.length ?? 0;
  const logs = text.match(/console\.log\(|dbg!\(|println!\(/g)?.length ?? 0;
  const mojibake = /\uFFFD|Ã.|Å[\u0080-\u00bf]|Ä[\u0080-\u00bf]/.test(text);
  if (secrets || logs || mojibake) { failures++; console.info(JSON.stringify({ path, possibleSecretCount: secrets, debugLogCount: logs, encodingIssue: mojibake })); }
}
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
if (config.identifier !== 'com.alican.ackdeck' || config.productName !== 'ACKDeck' || config.app.windows[0].title !== 'ACKDeck') failures++;
const ico = readFileSync('src-tauri/icons/icon.ico');
const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256);
console.info('Windows icon sizes: ' + sizes.join(', '));
if (!sizes.includes(256) || !sizes.includes(32)) failures++;
console.info('Release audit failures: ' + failures);
process.exitCode = failures ? 1 : 0;
