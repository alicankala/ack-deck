import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import {setupModules} from './helpers.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function find(tree,fn){if(!tree||typeof tree!=='object')return null;if(fn(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,fn);if(found)return found;}return null;}
test('add-to-notes waits for a durable file, preserves concurrent notes and blocks a second submit',async()=>{
  const env=setupModules(),notes=env.load('notesStore'),states=[],exports={};let cursor=0,release,caches=0;
  const item={id:'voice-123',kind:'file',title:'ses.ogg',mime:'audio/ogg',size:1024,createdAt:1,expiresAt:Date.now()+1000,handled:0,content:''};states[0]=[item];
  const hooks={useState:initial=>{const slot=cursor++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],next=>states[slot]=typeof next==='function'?next(states[slot]):next];},useRef:initial=>{const slot=cursor++;return states[slot]??={current:initial};},useEffect:()=>{}};
  const client={cachePhoneFile:async()=>{caches++;return new Promise(resolve=>release=()=>resolve({id:item.id,name:item.title,mime:item.mime,size:item.size}));}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/PhoneInbox.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,crypto:webcrypto,Date,window:{confirm:()=>true},require:name=>name==='react'?hooks:name==='react/jsx-runtime'?jsx:name==='../phoneClient'?client:name==='../notesStore'?notes:name.includes('shared/phone')?{validUrl:()=>true}:name.includes('ActionMenu')?{ActionMenu:()=>null}:name.includes('EditorDialog')?{EditorDialog:()=>null}:name.includes('PhoneMedia')?{PhoneMedia:()=>null}:name==='../inboxProcessing'?env.load('inboxProcessing'):name==='../projectStore'?env.load('projectStore'):name==='../activityStore'?env.load('activityStore'):name==='../productIntelligence'?env.load('productIntelligence'):{openUrl:async()=>{}}});
  const render=()=>{cursor=0;return exports.PhoneInbox({onAiDraft(){}});};
  find(render(),n=>n.type==='button'&&n.props.children==='Nota dönüştür').props.onClick();
  let tree=render();find(tree,n=>n.type==='input').props.onChange({target:{value:'Toplantı'}});
  tree=render();find(tree,n=>n.type==='textarea').props.onChange({target:{value:'Kısa açıklama'}});
  tree=render();const submit=find(tree,n=>n.type==='form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});
  await settle();assert.equal(caches,1);assert.equal(notes.loadNotes().notes.length,0);
  notes.saveNotes([{id:'another',title:'Eşitlemeden gelen not',content:'Korunmalı',updatedAt:1}]);release();await settle();
  const saved=notes.loadNotes().notes;assert.equal(saved.length,2);assert.equal(saved[0].title,'Toplantı');assert.equal(saved[0].content,'Kısa açıklama');assert.equal(saved[0].attachments[0].id,item.id);assert.equal(saved[1].id,'another');
});
test('recorded duration probing never plays audio and preserves later intentional seeks',()=>{
  const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../shared/audio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
  let plays=0;const audio={duration:Infinity,currentTime:0,play:()=>plays++};exports.prepareAudioDuration(audio);assert.equal(plays,0);assert.equal(audio.currentTime,1e10);
  audio.duration=63;exports.restoreAudioStart(audio);assert.equal(audio.currentTime,0);audio.currentTime=30;exports.restoreAudioStart(audio);assert.equal(audio.currentTime,30);assert.equal(plays,0);
});
