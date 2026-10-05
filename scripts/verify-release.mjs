import { readFileSync, readdirSync } from 'node:fs';
const html = readFileSync('dist/index.html', 'utf8');
const asset = html.match(/assets\/(index-[^" ]+\.js)/)[1];
const exe = readFileSync('src-tauri/target/release/ack-deck.exe');
const embedded = exe.includes(Buffer.from(asset));
console.info(JSON.stringify({ latestFrontendAsset: asset, embeddedInRelease: embedded }));
if (!embedded) console.info('Embedded asset names: ' + (exe.toString('latin1').match(/index-[A-Za-z0-9_-]+\.js/g) ?? []).join(', '));
for (const kind of ['nsis', 'msi']) {
  const files = readdirSync('src-tauri/target/release/bundle/' + kind);
  console.info(kind + ': ' + files.join(', '));
}
process.exitCode = embedded ? 0 : 1;
