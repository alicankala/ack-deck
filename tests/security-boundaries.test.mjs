import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setupModules} from './helpers.mjs';
test('AI context strips native paths recursively but retains stable IDs and Turkish display text',()=>{
 const {load}=setupModules(),privacy=load('privacy');
 const input={id:'file-1',name:'Türkçe örnek',folderPath:'C:\\Users\\fixture',file:{path:'\\\\server\\private',fileName:'Örnek.pdf'},shortcut:{target:'C:/private/run.exe'},description:'Konum C:\\Users\\Fixture\\note.txt'};
 const output=JSON.stringify(privacy.safeAiContext(input));
 assert.ok(output.includes('file-1'));assert.ok(output.includes('Türkçe örnek'));assert.ok(output.includes('Örnek.pdf'));assert.ok(!output.includes('private'));assert.ok(!output.includes('Users'));
 assert.equal(privacy.scrubPrivateText('Çarşamba görevi: ödeme ve not'), 'Çarşamba görevi: ödeme ve not');
 assert.equal(privacy.scrubPrivateText('C:\\Users\\fixture'), '[yerel konum]');
 assert.equal(privacy.scrubPrivateText('\\\\server\\private'), '[yerel konum]');
});
test('sync scrubs nested user credentials and paths without touching ordinary text or the local input',async()=>{
 const {load,calls}=setupModules(),privacy=load('privacy');
 const data={text:'Türkçe görev',content:'Bearer fixture-token-abcdefgh',checklist:[{text:'C:/private/doc.txt'}]};
 const clean=privacy.scrubSync(data);assert.equal(clean.text,data.text);assert.equal(clean.content,'[gizli anahtar]');assert.equal(clean.checklist[0].text,'[yerel konum]');assert.ok(data.content.includes('Bearer'));
 await load('phoneClient').phoneRequest('mutate',{data});assert.ok(!JSON.stringify(calls[0].args.body).includes('fixture-token'));
});
test('backup refuses explicit credentials in otherwise compatible user data',()=>{
 const {load}=setupModules(),privacy=load('privacy');
 for(const secret of ['Bearer fixture-token-abcdefgh','api_key=fixture-key-abcdefgh','-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----']) {
   assert.equal(privacy.hasCredentials(secret),true);
   const text=JSON.stringify({formatVersion:1,appVersion:'1.2.0',createdAt:new Date().toISOString(),data:{notes:[{id:'note',title:'Not',content:secret,updatedAt:1}]}});
   assert.throws(()=>load('backupStore').parseBackup(text),/gizli/);
 }
});
test('all custom handlers are manifested; only local main can use sensitive APIs',()=>{
 const root=new URL('../',import.meta.url),lib=readFileSync(new URL('src-tauri/src/lib.rs',root),'utf8'),manifest=readFileSync(new URL('src-tauri/build.rs',root),'utf8');
 for(const match of lib.matchAll(/^\s+\w+::(\w+),?$/gm))assert.ok(manifest.includes('"'+match[1]+'"'),match[1]);
 const main=JSON.parse(readFileSync(new URL('src-tauri/capabilities/default.json',root))),palette=JSON.parse(readFileSync(new URL('src-tauri/capabilities/palette.json',root)));
 assert.deepEqual(main.windows,['main']);assert.ok(main.permissions.includes('main-commands'));assert.ok(!palette.permissions.includes('main-commands'));assert.equal(main.remote,undefined);assert.equal(palette.remote,undefined);
 const config=JSON.parse(readFileSync(new URL('src-tauri/tauri.conf.json',root)));assert.ok(config.app.security.csp.includes("object-src 'none'"));assert.ok(!config.app.security.csp.includes('unsafe-eval'));assert.ok(config.app.security.csp.includes("media-src 'self' blob:"));assert.ok(config.app.security.csp.includes("frame-src blob:"));
});
