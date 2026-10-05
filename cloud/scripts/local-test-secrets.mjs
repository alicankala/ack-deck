import { writeFileSync, existsSync } from 'node:fs';
import { webcrypto, randomBytes } from 'node:crypto';
const file=new URL('../.dev.vars',import.meta.url);
if(existsSync(file)){console.error('Mevcut yerel secret dosyası korunuyor. Üzerine yazılmadı.');process.exit(1);}
const key=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
writeFileSync(file,`OWNER_SECRET="${randomBytes(32).toString('base64url')}"\nVAPID_PUBLIC_KEY="${Buffer.from(await webcrypto.subtle.exportKey('raw',key.publicKey)).toString('base64url')}"\nVAPID_PRIVATE_KEY="${(await webcrypto.subtle.exportKey('jwk',key.privateKey)).d}"\nVAPID_SUBJECT="mailto:local-test@example.invalid"\n`,{flag:'wx'});
console.log('Yalnızca yerel test için rastgele secret dosyası oluşturuldu; değerler görüntülenmedi.');
