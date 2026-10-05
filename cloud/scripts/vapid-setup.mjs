import { webcrypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const cwd = fileURLToPath(new URL('../', import.meta.url));
const auth = spawnSync(process.execPath,[wrangler,'whoami'],{cwd,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(auth.status !== 0 || /not authenticated|not logged|not currently logged/i.test(auth.stdout+auth.stderr)){console.error('Önce cloud klasöründe npx wrangler login çalıştırın.');process.exit(1);}
const subject = process.argv[2];
if(!subject || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)){console.error('Kullanım: node scripts/vapid-setup.mjs mailto:adresiniz@example.com');process.exit(1);}
const existing=spawnSync(process.execPath,[wrangler,'secret','list'],{cwd,encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
if(existing.status!==0){console.error('Worker secret listesi alınamadı. Önce Worker dağıtımını tamamlayın.');process.exit(1);}
if(existing.stdout.includes('VAPID_PRIVATE_KEY')){console.error('VAPID anahtarı zaten var. Mevcut telefon aboneliklerini bozmamak için değiştirilmedi.');process.exit(1);}
const keys = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
const privateKey=(await webcrypto.subtle.exportKey('jwk',keys.privateKey)).d;
for(const [name,value] of [['VAPID_PUBLIC_KEY',publicKey],['VAPID_PRIVATE_KEY',privateKey],['VAPID_SUBJECT',subject]]){
  const result=spawnSync(process.execPath,[wrangler,'secret','put',name],{cwd,input:value+'\n',encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(result.status!==0){console.error('Bildirim anahtarları sunucuya kaydedilemedi. Anahtar değeri görüntülenmedi.');process.exit(1);}
}
console.log('Bildirim anahtarları Worker secrets içinde hazır. Gizli anahtar dosyaya veya loga yazılmadı.');
