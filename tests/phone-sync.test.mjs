import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {posix} from 'node:path';
import ts from 'typescript';
function setup(initial=[]){const values=new Map(initial),modules={},calls=[];const window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},dispatchEvent:()=>{}};
  function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;const source=readFileSync(new URL('../'+path+'.ts',import.meta.url),'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window,require:name=>name==='@tauri-apps/api/core'?{invoke:async(...args)=>{calls.push(args);return true;}}:load(posix.normalize(posix.join(posix.dirname(path),name))),structuredClone,crypto,URL,TextEncoder,TextDecoder,Intl,Event,Date});return exports;}return{values,load,calls};}
const task={id:'local-task',text:'Yerel görev',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false};
const cloudTask={text:'Telefon görevi',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false,dueAt:null,timezone:'UTC'};
function transport(){const records=new Map(),mutations=new Map();let seq=0;const calls=[];const request=async(operation,body={})=>{calls.push({operation,body});if(operation==='mutate'){if(mutations.has(body.mutationId))return mutations.get(body.mutationId);const key=body.kind+':'+body.id,current=records.get(key);if((current?.version??0)!==body.baseVersion)return{conflict:true,record:current??null};const record={kind:body.kind,id:body.id,version:body.baseVersion+1,data:body.data,deleted:body.deleted,updatedAt:Date.now()};records.set(key,record);seq++;const response={record};mutations.set(body.mutationId,response);return response;}if(operation==='sync')return{records:[...records.values()],cursor:seq,more:false};return{ok:true};};return{records,request,calls};}
test('desktop task/note upload is opt-in through backend transport, preserves stable IDs and does not repeat unchanged records',async()=>{
  const env=setup([['ack-deck.tasks.v1',JSON.stringify([task])],['ack-deck.notes.v1',JSON.stringify([{id:'n',title:'Yerel not',content:'FAT32',updatedAt:1}])]]),api=env.load('src/phoneSync'),server=transport();await api.synchronizePhone(server.request);assert.equal(server.records.size,2);assert.equal(server.records.get('tasks:local-task').data.text,task.text);const mutations=server.calls.filter(row=>row.operation==='mutate').length;await api.synchronizePhone(server.request);assert.equal(server.calls.filter(row=>row.operation==='mutate').length,mutations);assert.equal(env.calls.length,0);
});
test('mobile task/note edits, completion and tombstones reach the existing local stores',async()=>{
  const env=setup(),api=env.load('src/phoneSync'),server=transport();server.records.set('tasks:t',{kind:'tasks',id:'t',version:1,data:cloudTask,deleted:false,updatedAt:1});server.records.set('notes:n',{kind:'notes',id:'n',version:1,data:{title:'Telefon notu',content:'UART',updatedAt:1},deleted:false,updatedAt:1});await api.synchronizePhone(server.request);assert.equal(JSON.parse(env.values.get('ack-deck.tasks.v1'))[0].text,'Telefon görevi');assert.equal(JSON.parse(env.values.get('ack-deck.notes.v1'))[0].title,'Telefon notu');server.records.set('tasks:t',{...server.records.get('tasks:t'),version:2,data:{...cloudTask,completed:true}});server.records.set('notes:n',{...server.records.get('notes:n'),version:2,data:null,deleted:true});await api.synchronizePhone(server.request);assert.equal(JSON.parse(env.values.get('ack-deck.tasks.v1'))[0].completed,true);assert.equal(JSON.parse(env.values.get('ack-deck.notes.v1')).length,0);
});
test('simultaneous changes preserve local content and expose the server version as a conflict',async()=>{
  const env=setup([['ack-deck.tasks.v1',JSON.stringify([task])]]),api=env.load('src/phoneSync'),server=transport();await api.synchronizePhone(server.request);env.values.set('ack-deck.tasks.v1',JSON.stringify([{...task,text:'Yerel düzenleme'}]));server.records.set('tasks:local-task',{...server.records.get('tasks:local-task'),version:2,data:{...cloudTask,text:'Mobil düzenleme'}});const state=await api.synchronizePhone(server.request);assert.equal(JSON.parse(env.values.get('ack-deck.tasks.v1'))[0].text,'Yerel düzenleme');assert.equal(state.conflicts[0].server.data.text,'Mobil düzenleme');
});
test('local deletion sends a tombstone, does not resurrect on retry and uploads no paths/secrets/AI history',async()=>{
  const env=setup([['ack-deck.tasks.v1',JSON.stringify([task])],['ack-deck.ai-history.v1','private chat'],['ack-deck.projects.v1','private path']]),api=env.load('src/phoneSync'),server=transport();await api.synchronizePhone(server.request);env.values.set('ack-deck.tasks.v1','[]');await api.synchronizePhone(server.request);assert.equal(server.records.get('tasks:local-task').deleted,true);const payload=JSON.stringify(server.calls);assert.ok(!payload.includes('private path'));assert.ok(!payload.includes('private chat'));assert.ok(!payload.includes('remindedFor'));
});
test('restore/pause invalidates in-flight cloud responses before any local record is overwritten',async()=>{
  const env=setup(),api=env.load('src/phoneSync');let release;const promise=api.synchronizePhone(async(operation)=>operation==='sync'?await new Promise(resolve=>{release=resolve;}):{});await new Promise(resolve=>setTimeout(resolve,0));api.pausePhoneSync(true);release({records:[{kind:'tasks',id:'t',version:1,data:cloudTask,deleted:false,updatedAt:1}],cursor:1,more:false});await assert.rejects(promise);assert.equal(env.values.has('ack-deck.tasks.v1'),false);
});
test('phone AI Inbox pre-fills only; owner credentials and binary transfers remain outside frontend storage/backup',()=>{
  const app=readFileSync(new URL('../src/components/AckAi.tsx',import.meta.url),'utf8');assert.match(app,/setDraft\(prefill.text\)/);const client=readFileSync(new URL('../src/phoneClient.ts',import.meta.url),'utf8');assert.doesNotMatch(client,/owner.secret|localStorage|bearer/i);const backup=readFileSync(new URL('../src/backupStore.ts',import.meta.url),'utf8');assert.doesNotMatch(backup,/phone-owner|VAPID_PRIVATE|deviceToken/);const native=readFileSync(new URL('../src-tauri/src/phone.rs',import.meta.url),'utf8');assert.match(native,/bearer_auth\(&secret\)/);assert.match(native,/Policy::none/);assert.doesNotMatch(native,/Command::new/);
});
test('mobile note edits preserve desktop attachment references without uploading binary data or local cache metadata',async()=>{
  const attachment={id:'voice-123',name:'ses.ogg',mime:'audio/ogg',size:1024};
  const env=setup([['ack-deck.notes.v1',JSON.stringify([{id:'n',title:'Toplantı',content:'Özet',updatedAt:1,attachments:[attachment]}])]]),api=env.load('src/phoneSync'),server=transport();
  await api.synchronizePhone(server.request);
  assert.equal('attachments' in server.records.get('notes:n').data,false);
  server.records.set('notes:n',{...server.records.get('notes:n'),version:2,data:{title:'Mobil başlık',content:'Yeni açıklama',updatedAt:2}});
  await api.synchronizePhone(server.request);
  const saved=JSON.parse(env.values.get('ack-deck.notes.v1'))[0];assert.equal(saved.title,'Mobil başlık');assert.deepEqual(saved.attachments,[attachment]);
  assert.equal(JSON.stringify(server.calls).includes('voice-123'),false);
});
