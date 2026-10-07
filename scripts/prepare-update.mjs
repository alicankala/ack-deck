import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = config.version;
const installer = resolve(root, `src-tauri/target/release/bundle/nsis/ACKDeck_${version}_x64-setup.exe`);
if (!existsSync(installer) || !existsSync(installer + '.sig')) throw new Error('Bu sürümün imzalı NSIS paketi bulunamadı. Önce imza anahtarıyla build alın.');
const signature = readFileSync(installer + '.sig', 'utf8').trim();
if (!signature) throw new Error('Güncelleme imzası boş.');
const manifest = { version, notes: 'ACKDeck güncellemesi', pub_date: new Date().toISOString(), platforms: { 'windows-x86_64': { signature, url: `https://github.com/alicankala/ack-deck/releases/download/v${version}/${basename(installer)}` } } };
const output = resolve(root, 'src-tauri/target/release/bundle/nsis/latest.json');
writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Hazır: ${basename(installer)}, ${basename(installer)}.sig, latest.json. GitHub release etiketi: v${version}`);
