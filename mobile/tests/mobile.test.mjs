import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {posix} from 'node:path';
import ts from 'typescript';
import {IDBFactory} from 'fake-indexeddb';
function runtime(database=new IDBFactory()){
  const modules={};function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;const source=readFileSync(new URL('../../'+path+'.ts',import.meta.url),'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,indexedDB:database,require:name=>load(posix.normalize(posix.join(posix.dirname(path),name))),structuredClone,crypto,URL,TextEncoder,TextDecoder,AbortSignal,Headers,Date});return exports;}return{load,database};
}
const task={text:'SD kart al',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false,dueAt:null,timezone:'UTC'};
const mutation=(kind,id,data,version=0)=>({mutationId:crypto.randomUUID(),kind,id,baseVersion:version,data,deleted:false});
test('study programs survive offline creation, queued edits, restart and a schema-3 upgrade without creating tasks',async()=>{
 const env=runtime(),store=env.load('mobile/src/store'),program={id:'program',name:'Derslerim',startDate:'2026-10-05',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'block',subject:'Matematik',topic:'Türev',weekdays:[1,3],time:'19:00',minutes:50}]};
 let state={...store.emptyState(),token:'paired',syncSchema:3,cursor:90};state=store.enqueue(state,mutation('studyPrograms',program.id,program));state=store.enqueue(state,mutation('studyPrograms',program.id,{...program,name:'Güncel program'},1));await store.saveState(state);
 const saved=await store.readState();assert.equal(saved.queue.length,2);assert.equal(saved.token,'paired');assert.equal(saved.records.some(r=>r.kind==='tasks'),false);
 const calls=[],records=[];const synced=await store.synchronize(saved,async(_state,path,options)=>{calls.push(path);if(path==='mutations'){const m=JSON.parse(options.body),record={kind:m.kind,id:m.id,version:m.baseVersion+1,data:m.data,deleted:m.deleted,updatedAt:1};records.splice(0,records.length,record);return{record};}return{records,cursor:2,more:false};});
 assert.equal(synced.syncSchema,4);assert.ok(calls.includes('sync?cursor=0'));assert.equal(synced.queue.length,0);assert.equal(synced.records[0].data.name,'Güncel program');assert.equal(synced.records[0].data.sessions.length,1);assert.equal(synced.token,'paired');
});
test('schema upgrade preserves offline linked tasks, checklists, project next step and note attachment references',async()=>{
  const env=runtime(),store=env.load('mobile/src/store');
  let state={...store.emptyState(),token:'existing-pairing',cursor:900,syncSchema:2};
  const project={name:'ACKDeck',description:'Ürün',nextStep:'Telefon testi',workspaceId:'w',inboxIds:['i']};
  state=store.enqueue(state,mutation('projects','p',project));
  state=store.enqueue(state,mutation('tasks','t',{...task,projectId:'p',checklist:[{id:'step',text:'Test',completed:false}],reminderLeadMinutes:60}));
  state=store.enqueue(state,mutation('notes','n',{title:'Ses',content:'Özet',updatedAt:1,projectId:'p',attachments:[{id:'i',name:'Ses.ogg',mime:'audio/ogg',size:100}]}));
  await store.saveState(state);
  const reopened=await runtime(env.database).load('mobile/src/store').readState();assert.equal(reopened.token,'existing-pairing');assert.equal(reopened.queue.length,3);
  const calls=[],records=[];
  const synced=await store.synchronize(reopened,async(_state,path,options)=>{calls.push(path);if(path==='mutations'){const m=JSON.parse(options.body),record={kind:m.kind,id:m.id,data:m.data,version:m.baseVersion+1,deleted:m.deleted,updatedAt:1};records.push(record);return{record};}return{records,cursor:3,more:false};});
  assert.ok(calls.includes('sync?cursor=0'));assert.equal(synced.syncSchema,4);assert.equal(synced.queue.length,0);assert.equal(synced.records.find(r=>r.id==='p').data.nextStep,'Telefon testi');assert.equal(synced.records.find(r=>r.id==='t').data.checklist[0].id,'step');assert.equal(synced.records.find(r=>r.id==='n').data.attachments[0].id,'i');
  const deleted=store.enqueue(synced,{...mutation('projects','p',null,1),deleted:true});await store.saveState(deleted);assert.equal((await store.readState()).records.find(r=>r.id==='p').deleted,true);assert.equal((await store.readState()).records.find(r=>r.id==='t').data.projectId,'p');
});
test('custom phone task order survives offline capture and restart without changing record data',async()=>{
  const env=runtime(),store=env.load('mobile/src/store');let state=store.emptyState();
  state=store.enqueue(state,mutation('tasks','a',task));state=store.enqueue(state,mutation('tasks','b',{...task,text:'B'}));
  state={...state,taskOrder:['b','a']};await store.saveState(state);
  const restored=await runtime(env.database).load('mobile/src/store').readState();assert.deepEqual(Array.from(restored.taskOrder),['b','a']);
  const next=store.enqueue(restored,mutation('tasks','c',{...task,text:'C'}));assert.deepEqual(Array.from(next.taskOrder),['b','a']);assert.equal(next.records.find(r=>r.id==='a').data.text,task.text);
});
test('recurring completion and subscription metadata survive offline restart, deletion and undo queue',async()=>{
  const env=runtime(),store=env.load('mobile/src/store'),rec=env.load('shared/recurrence');
  const rule={frequency:'weekly',interval:1,weekdays:[1,3,5],dayOfMonth:15,start:'2026-10-05',time:'20:00',timezone:'Europe/Istanbul',endDate:null,count:null};
  const due=rec.zonedAt('2026-10-07','20:00',rule.timezone);
  let state={...store.emptyState(),token:'paired'};const original={...task,text:'Vitamin',dueDate:'2026-10-07',dueTime:'20:00',dueAt:due,timezone:rule.timezone,recurrence:rule,occurrenceAt:due,reminder:true};
  state=store.enqueue(state,mutation('tasks','r',original));state=store.enqueue(state,mutation('tasks','r',rec.completeOccurrence(original,due)));
  const sub={id:'s',name:'YouTube',category:'Video',amount:120,currency:'TRY',cycle:'monthly',periodDays:30,nextPayment:'2026-10-08',autoRenew:true,status:'active',website:'',note:'',icon:'',reminderDays:3,timezone:rule.timezone,createdAt:1,updatedAt:1};
  state=store.enqueue(state,mutation('subscriptions','s',sub));await store.saveState(state);
  const restored=await runtime(env.database).load('mobile/src/store').readState();assert.equal(restored.records.find(r=>r.id==='r').data.dueDate,'2026-10-09');assert.equal(restored.records.find(r=>r.id==='r').data.completed,false);assert.equal(restored.records.find(r=>r.id==='s').data.reminderDays,3);
  state=store.enqueue(restored,{...mutation('subscriptions','s',null),deleted:true});state=store.enqueue(state,mutation('subscriptions','s',sub));assert.deepEqual(Array.from(state.queue.filter(r=>r.kind==='subscriptions').map(r=>r.baseVersion)),[0,1,2]);
  await store.saveState(state);await assert.rejects(store.synchronize(state,async()=>{throw Error('Offline');}));assert.equal((await store.readState()).queue.length,5);
});
test('mobile hierarchy, safe areas, keyboard viewport, labels and bounded forms use shared controls',()=>{
  const ui=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const nav=readFileSync(new URL('../src/MobileNav.tsx',import.meta.url),'utf8');
  assert.match(nav,/id: "more", label: "Diğer"/);assert.doesNotMatch(nav,/id: "subscriptions"/);assert.match(ui,/<MobileNav/);assert.match(ui,/inert=\{!!form \|\| !!subscriptionDraft\}/);assert.match(ui,/page==="notes"/);assert.match(ui,/RecurrenceFields/);assert.match(ui,/SubscriptionForm/);assert.match(ui,/visualViewport\?\.height/);assert.match(ui,/event.key!=="Tab"/);assert.match(css,/safe-area-inset-top/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/repeat\(4,minmax\(0,1fr\)\)/);assert.match(css,/min-height:44px/);assert.match(css,/body:has\(\.editor\) nav/);
});
test('offline task/note queue and visible data survive a PWA restart',async()=>{
  const env=runtime(),store=env.load('mobile/src/store');let state=store.emptyState();state.token='test-mobile-token';state=store.enqueue(state,mutation('tasks','t',task));state=store.enqueue(state,mutation('notes','n',{title:'Not',content:'FAT32 kullan',updatedAt:1}));await store.saveState(state);
  const reopened=await runtime(env.database).load('mobile/src/store').readState();assert.equal(reopened.queue.length,2);assert.equal(reopened.records.find(row=>row.id==='t').data.text,'SD kart al');
});
test('reconnect drains an idempotent offline mutation and pulls cloud completion/tombstones',async()=>{
  const store=runtime().load('mobile/src/store');let state={...store.emptyState(),token:'paired'};state=store.enqueue(state,mutation('tasks','t',task));const writes=[],calls=[];
  const result=await store.synchronize(state,async(_state,path,options)=>{calls.push(path);if(path==='mutations'){const data=JSON.parse(options.body);return{record:{kind:data.kind,id:data.id,version:1,data:data.data,deleted:false,updatedAt:1}};}return{records:[{kind:'tasks',id:'t',version:2,data:{...task,completed:true},deleted:false,updatedAt:2},{kind:'notes',id:'removed',version:2,data:null,deleted:true,updatedAt:2}],cursor:2,more:false};},async value=>writes.push(structuredClone(value)));
  assert.equal(result.queue.length,0);assert.equal(result.records.find(row=>row.id==='t').data.completed,true);assert.equal(result.records.find(row=>row.id==='removed').deleted,true);assert.ok(writes.length>=2);assert.equal(calls.filter(path=>path==='mutations').length,1);
});
test('parallel edits retain local and server versions rather than losing text',async()=>{
  const store=runtime().load('mobile/src/store');let state={...store.emptyState(),token:'paired',records:[{kind:'notes',id:'n',version:1,data:{title:'Original',content:'A',updatedAt:1},deleted:false,updatedAt:1}]};state=store.enqueue(state,mutation('notes','n',{title:'Local',content:'B',updatedAt:2},1));
  const server={kind:'notes',id:'n',version:2,data:{title:'Remote',content:'C',updatedAt:3},deleted:false,updatedAt:3};const result=await store.synchronize(state,async(_state,path)=>path==='mutations'?{conflict:true,record:server}:{records:[server],cursor:2,more:false},async()=>{});
  assert.equal(result.records[0].data.content,'B');assert.equal(result.conflicts[0].server.data.content,'C');assert.equal(result.queue.length,0);
});
test('failed sync preserves a durable retry queue and chained edits use sequential versions',async()=>{
  const store=runtime().load('mobile/src/store');let state={...store.emptyState(),token:'paired'};state=store.enqueue(state,mutation('tasks','t',task));state=store.enqueue(state,mutation('tasks','t',{...task,text:'Updated'}));assert.deepEqual([...state.queue.map(row=>row.baseVersion)],[0,1]);await store.saveState(state);
  await assert.rejects(store.synchronize(state,async()=>{throw new Error('offline');}));assert.equal((await store.readState()).queue.length,2);
});
test('manifest, production service worker, privacy and notification click routing are local-safe',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.name,'ACKDeck');assert.equal(manifest.short_name,'ACKDeck');assert.equal(manifest.display,'standalone');
  const worker=readFileSync(new URL('../dist/sw.js',import.meta.url),'utf8');assert.match(worker,/\/assets\/index-/);assert.match(worker,/pathname.startsWith\('\/api\/'\)/);assert.match(worker,/notificationclick/);assert.doesNotMatch(worker,/__ACK_PRECACHE__/);
  const push=readFileSync(new URL('../src/push.ts',import.meta.url),'utf8');assert.ok(push.indexOf('Notification.requestPermission()')<push.indexOf('const status = await api'));assert.match(push,/Ana Ekranınıza/);
  const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');assert.match(main,/getUserMedia\(\{audio:true\}\)/);assert.match(main,/setTimeout\(\(\)=>rec.state/);assert.doesNotMatch(main,/speechRecognition|read_file|execute_command/);
});
