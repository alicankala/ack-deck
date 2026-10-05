import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match=>match[1]);
const files=['/','/manifest.webmanifest','/icon-192.png','/icon-512.png',...assets];
let worker=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
worker=worker.replace('__ACK_BUILD__',createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,12)).replace("'__ACK_PRECACHE__'",JSON.stringify(files));
writeFileSync(new URL('../dist/sw.js',import.meta.url),worker);
