import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {posix} from 'node:path';
import ts from 'typescript';
import {IDBFactory} from 'fake-indexeddb';
function runtime(database=new IDBFactory()){
  const modules={};function load(path){if(modules[path])return modules[path];const exports={};modules[path]=exports;const source=readFileSync(new URL('../../'+path+'.ts',import.meta.url),'utf8');runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,indexedDB:database,require:name=>name==='adhan'?{Coordinates:class{},CalculationMethod:{Turkey:()=>({})},PrayerTimes:class{}}:load(posix.normalize(posix.join(posix.dirname(path),name))),structuredClone,crypto,URL,TextEncoder,TextDecoder,AbortSignal,Headers,Date});return exports;}return{load,database};
}
const task={text:'SD kart al',completed:false,dueDate:null,dueTime:null,priority:'normal',reminder:false,dueAt:null,timezone:'UTC'};
const mutation=(kind,id,data,version=0)=>({mutationId:crypto.randomUUID(),kind,id,baseVersion:version,data,deleted:false});
test('study programs survive offline creation, queued edits, restart and a schema-3 upgrade without creating tasks',async()=>{
 const env=runtime(),store=env.load('mobile/src/store'),program={id:'program',name:'Derslerim',startDate:'2026-10-05',endDate:null,timezone:'Europe/Istanbul',active:true,updatedAt:1,sessions:[{id:'block',subject:'Matematik',topic:'Türev',weekdays:[1,3],time:'19:00',minutes:50}]};
 let state={...store.emptyState(),token:'paired',syncSchema:3,cursor:90};state=store.enqueue(state,mutation('studyPrograms',program.id,program));state=store.enqueue(state,mutation('studyPrograms',program.id,{...program,name:'Güncel program'},1));await store.saveState(state);
 const saved=await store.readState();assert.equal(saved.queue.length,2);assert.equal(saved.token,'paired');assert.equal(saved.records.some(r=>r.kind==='tasks'),false);
 const calls=[],records=[];const synced=await store.synchronize(saved,async(_state,path,options)=>{calls.push(path);if(path==='mutations'){const m=JSON.parse(options.body),record={kind:m.kind,id:m.id,version:m.baseVersion+1,data:m.data,deleted:m.deleted,updatedAt:1};records.splice(0,records.length,record);return{record};}return{records,cursor:2,more:false};});
 assert.equal(synced.syncSchema,5);assert.ok(calls.includes('sync?cursor=0'));assert.equal(synced.queue.length,0);assert.equal(synced.records[0].data.name,'Güncel program');assert.equal(synced.records[0].data.sessions.length,1);assert.equal(synced.token,'paired');
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
  assert.ok(calls.includes('sync?cursor=0'));assert.equal(synced.syncSchema,5);assert.equal(synced.queue.length,0);assert.equal(synced.records.find(r=>r.id==='p').data.nextStep,'Telefon testi');assert.equal(synced.records.find(r=>r.id==='t').data.checklist[0].id,'step');assert.equal(synced.records.find(r=>r.id==='n').data.attachments[0].id,'i');
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
  assert.match(nav,/id: "send", label: "Gönder"/);assert.doesNotMatch(nav,/id: "subscriptions"/);assert.match(ui,/<MobileNav/);assert.match(ui,/inert=\{!!form \|\| !!subscriptionDraft\}/);assert.match(ui,/page==="notes"/);assert.match(ui,/RecurrenceFields/);assert.match(ui,/SubscriptionForm/);assert.match(ui,/visualViewport\?\.height/);assert.match(ui,/event.key!=="Tab"/);assert.match(css,/safe-area-inset-top/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/repeat\(5,minmax\(0,1fr\)\)/);assert.match(css,/min-height:44px/);assert.match(css,/body:has\(\.editor\) nav/);
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
test('offline edits on different lines of the same note merge automatically without conflict',async()=>{
  const store=runtime().load('mobile/src/store');
  let state={...store.emptyState(),token:'paired',records:[{kind:'notes',id:'n-merge',version:1,data:{title:'Ortak Not',content:'Satır 1\nSatır 2\nSatır 3',updatedAt:1},deleted:false,updatedAt:1}]};
  state=store.enqueue(state,mutation('notes','n-merge',{title:'Ortak Not',content:'Satır 1 (Mobil)\nSatır 2\nSatır 3',updatedAt:2},1));
  const server={kind:'notes',id:'n-merge',version:2,data:{title:'Ortak Not',content:'Satır 1\nSatır 2\nSatır 3 (PC)',updatedAt:3},deleted:false,updatedAt:3};
  let pushedMerged=null;
  const result=await store.synchronize(state,async(_state,path,options)=>{
    if(path==='mutations'){
      const body=JSON.parse(options.body);
      if(body.baseVersion===1)return{conflict:true,record:server};
      pushedMerged=body.data;
      return{record:{kind:'notes',id:'n-merge',version:3,data:body.data,deleted:false,updatedAt:4}};
    }
    return{records:[{kind:'notes',id:'n-merge',version:3,data:pushedMerged,deleted:false,updatedAt:4}],cursor:3,more:false};
  },async()=>{});
  assert.equal(result.conflicts.length,0);
  assert.equal(result.records[0].data.content,'Satır 1 (Mobil)\nSatır 2\nSatır 3 (PC)');
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

test('face id auto-prompt on launch is direct, single-prompt and settings toggle is removed', () => {
  const settings = readFileSync(new URL('../src/MobileSettings.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(settings, /Açılışta Otomatik Face ID/);
  assert.match(settings, /Face ID \/ Touch ID ile Aç/);

  const lock = readFileSync(new URL('../src/MobileLockScreen.tsx', import.meta.url), 'utf8');
  assert.match(lock, /performBioAuth/);
  assert.doesNotMatch(lock, /config\.autoPromptBiometrics/);
  assert.match(lock, /autoPromptedRef\.current = true/);

  const sec = readFileSync(new URL('../src/mobileSecurity.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(sec, /autoPromptBiometrics:\s*existing\.autoPromptBiometrics/);
});

test('mobile monthly prayer modal styles and per-date queued sync handler are wired', () => {
  const mainTsx = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(mainTsx, /import\s+["']\.\/styles\/prayer-month\.css["']/);

  const prayerCard = readFileSync(new URL('../src/MobilePrayerCard.tsx', import.meta.url), 'utf8');
  assert.match(prayerCard, /mobile-date-modal-trigger/);
  assert.match(prayerCard, /<PrayerMonthModal/);
  assert.match(prayerCard, /commitLogWithRetry/);
  assert.match(prayerCard, /writeQueueRef/);
  assert.doesNotMatch(prayerCard, /currentRow\?\.version/);
});

function mountMobileAiChat({ apiImpl }) {
  const exports = {};
  const states = [];
  const refs = [];
  const effectsRun = [];
  let stateIdx = 0;
  let refIdx = 0;
  let effectIdx = 0;
  let fakeNow = 1_700_000_000_000;
  const startNow = fakeNow;
  const storageMap = new Map();
  const errors = [];
  const notices = [];
  let sendDoneResolve = null;

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fakeNow]));
    }
    static now() {
      return fakeNow;
    }
  }

  const hooks = {
    useState(initial) {
      const slot = stateIdx++;
      if (!(slot in states)) {
        states[slot] = typeof initial === 'function' ? initial() : initial;
      }
      const setter = (next) => {
        const prev = states[slot];
        states[slot] = typeof next === 'function' ? next(prev) : next;
        if (prev === true && states[slot] === false && sendDoneResolve) {
          const r = sendDoneResolve;
          sendDoneResolve = null;
          r();
        }
      };
      return [states[slot], setter];
    },
    useRef(initial) {
      const slot = refIdx++;
      if (!(slot in refs)) refs[slot] = { current: initial };
      return refs[slot];
    },
    useEffect(fn, deps) {
      const slot = effectIdx++;
      const prev = effectsRun[slot];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      if (changed) {
        effectsRun[slot] = deps;
        fn();
      }
    },
  };

  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
  const source = readFileSync(new URL('../src/MobileAiChat.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: 'h', jsxFragmentFactory: 'fragment' },
  }).outputText;

  runInNewContext(compiled, {
    exports,
    h,
    fragment: 'fragment',
    Date: FakeDate,
    setTimeout: (fn, delay = 0) => {
      fakeNow += delay;
      return setImmediate(fn);
    },
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, v),
    },
    navigator: { onLine: true },
    window: { confirm: () => true },
    crypto: globalThis.crypto,
    Promise,
    Error,
    encodeURIComponent,
    require: (id) => {
      if (id === 'react') return hooks;
      if (id === './store') {
        return {
          api: apiImpl,
          json: (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        };
      }
      throw new Error('Unexpected import: ' + id);
    },
  });

  const render = () => {
    stateIdx = 0;
    refIdx = 0;
    effectIdx = 0;
    return exports.MobileAiChat({
      state: { token: 'test-phone-token', name: 'iPhone', cursor: 0, records: [], queue: [], conflicts: [] },
      online: true,
      onNotice: (m) => notices.push(m),
      onError: (m) => errors.push(m),
    });
  };

  const findAll = (node, pred, acc = []) => {
    if (!node || typeof node !== 'object') return acc;
    if (pred(node)) acc.push(node);
    for (const child of node.children?.flat(Infinity) ?? []) findAll(child, pred, acc);
    return acc;
  };

  const sendViaStarter = async (modelChoice = 'fast') => {
    let tree = render();
    await new Promise((r) => setImmediate(r));
    if (modelChoice === 'powerful') {
      const sel = findAll(tree, (n) => n.type === 'select')[0];
      sel.props.onChange({ target: { value: 'powerful' } });
      tree = render();
    }
    const starter = findAll(tree, (n) => n.props?.className === 'mobile-ai-starter-chip')[0];
    const donePromise = new Promise((resolve) => { sendDoneResolve = resolve; });
    starter.props.onClick();
    await donePromise;
    return { tree: render(), elapsedMs: fakeNow - startNow };
  };

  return { render, sendViaStarter, errors, notices, storageMap, getElapsed: () => fakeNow - startNow };
}

test('MobileAiChat relay polling handles state=done, state=failed, and 55s/140s deadlines', async () => {
  // 1. Fast relay resolves on poll.state === "done"
  let pollCount1 = 0;
  const chat1 = mountMobileAiChat({
    apiImpl: async (_state, path) => {
      if (path === 'ai/status') return { configured: false };
      if (path === 'ai/chat') return { ok: true, mode: 'relay', queryId: 'q-done-1' };
      if (path === 'ai/query/q-done-1') {
        pollCount1++;
        if (pollCount1 < 2) return { state: 'pending', reply: null };
        return { state: 'done', reply: 'PC canlı yanıtı geldi.' };
      }
      throw new Error('Unexpected path: ' + path);
    },
  });
  await chat1.sendViaStarter('fast');
  assert.equal(chat1.errors.filter(Boolean).length, 0);
  const threads1 = JSON.parse(chat1.storageMap.get('ack-deck.mobile-ai-threads.v1'));
  assert.equal(threads1[0].messages.at(-1).role, 'model');
  assert.equal(threads1[0].messages.at(-1).text, 'PC canlı yanıtı geldi.');

  // 2. Relay failure propagates poll.reply on poll.state === "failed"
  const chat2 = mountMobileAiChat({
    apiImpl: async (_state, path) => {
      if (path === 'ai/status') return { configured: false };
      if (path === 'ai/chat') return { ok: true, mode: 'relay', queryId: 'q-fail-1' };
      if (path === 'ai/query/q-fail-1') {
        return { state: 'failed', reply: 'Masaüstünde Gemini API anahtarı ekli değil.' };
      }
      throw new Error('Unexpected path: ' + path);
    },
  });
  await chat2.sendViaStarter('fast');
  assert.equal(chat2.errors.at(-1), 'Masaüstünde Gemini API anahtarı ekli değil.');

  // 3. Powerful relay waits up to 140s (succeeds at ~96s without premature 36s timeout)
  let pollCount3 = 0;
  const chat3 = mountMobileAiChat({
    apiImpl: async (_state, path) => {
      if (path === 'ai/status') return { configured: false };
      if (path === 'ai/chat') return { ok: true, mode: 'relay', queryId: 'q-pow-1' };
      if (path === 'ai/query/q-pow-1') {
        pollCount3++;
        if (pollCount3 < 80) return { state: 'pending', reply: null }; // 80 * 1200ms = 96,000ms
        return { state: 'done', reply: 'Güçlü model yanıtı' };
      }
      throw new Error('Unexpected path: ' + path);
    },
  });
  const res3 = await chat3.sendViaStarter('powerful');
  assert.equal(chat3.errors.filter(Boolean).length, 0);
  assert.ok(res3.elapsedMs >= 90000);
  const threads3 = JSON.parse(chat3.storageMap.get('ack-deck.mobile-ai-threads.v1'));
  assert.equal(threads3[0].messages.at(-1).text, 'Güçlü model yanıtı');

  // 4. Fast relay times out at ~55s (not 36s), Powerful relay times out at ~140s
  const chat4 = mountMobileAiChat({
    apiImpl: async (_state, path) => {
      if (path === 'ai/status') return { configured: false };
      if (path === 'ai/chat') return { ok: true, mode: 'relay', queryId: 'q-timeout-fast' };
      if (path === 'ai/query/q-timeout-fast') return { state: 'pending', reply: null };
      throw new Error('Unexpected path: ' + path);
    },
  });
  const res4 = await chat4.sendViaStarter('fast');
  assert.ok(res4.elapsedMs >= 55000 && res4.elapsedMs < 60000, `Expected ~55s fast timeout, got ${res4.elapsedMs}`);
  assert.match(chat4.errors.at(-1), /Masaüstü zamanında yanıt vermedi/);

  const chat5 = mountMobileAiChat({
    apiImpl: async (_state, path) => {
      if (path === 'ai/status') return { configured: false };
      if (path === 'ai/chat') return { ok: true, mode: 'relay', queryId: 'q-timeout-pow' };
      if (path === 'ai/query/q-timeout-pow') return { state: 'pending', reply: null };
      throw new Error('Unexpected path: ' + path);
    },
  });
  const res5 = await chat5.sendViaStarter('powerful');
  assert.ok(res5.elapsedMs >= 140000 && res5.elapsedMs < 145000, `Expected ~140s powerful timeout, got ${res5.elapsedMs}`);
  assert.match(chat5.errors.at(-1), /Masaüstü zamanında yanıt vermedi/);
});

function createLockTestEnv({ biometricsAvailable = false, authResult = false } = {}) {
  const localMap = new Map();
  const sessionMap = new Map();
  const listeners = new Map();
  let bioCalls = 0;
  let nextTimerId = 1;
  const timers = new Map();

  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const fakeWindow = {
    location: { hostname: 'ackdeck.test', reload: () => {} },
    localStorage: {
      getItem: (k) => localMap.get(k) ?? null,
      setItem: (k, v) => localMap.set(k, String(v)),
      removeItem: (k) => localMap.delete(k),
    },
    sessionStorage: {
      getItem: (k) => sessionMap.get(k) ?? null,
      setItem: (k, v) => sessionMap.set(k, String(v)),
      removeItem: (k) => sessionMap.delete(k),
    },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev) => {
      for (const fn of [...(listeners.get(ev.type) ?? [])]) fn(ev);
      return true;
    },
    PublicKeyCredential: biometricsAvailable
      ? { isUserVerifyingPlatformAuthenticatorAvailable: async () => true }
      : undefined,
    confirm: () => true,
  };

  const fakeNavigator = {
    credentials: {
      get: async () => {
        bioCalls += 1;
        return authResult ? { id: 'cred-1' } : null;
      },
      create: async () => ({ rawId: new Uint8Array([1, 2, 3, 4]).buffer }),
    },
  };

  const fakeSetTimeout = (fn, ms = 0) => {
    const id = nextTimerId++;
    const handle = globalThis.setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.min(ms, 20));
    timers.set(id, handle);
    return id;
  };
  const fakeClearTimeout = (id) => {
    const handle = timers.get(id);
    if (handle) {
      globalThis.clearTimeout(handle);
      timers.delete(id);
    }
  };

  const secExports = {};
  const secSource = readFileSync(new URL('../src/mobileSecurity.ts', import.meta.url), 'utf8');
  const secCompiled = ts.transpileModule(secSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const baseCtx = {
    exports: secExports,
    window: fakeWindow,
    localStorage: fakeWindow.localStorage,
    sessionStorage: fakeWindow.sessionStorage,
    PublicKeyCredential: fakeWindow.PublicKeyCredential,
    navigator: fakeNavigator,
    document: { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} },
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    Date,
    Promise,
    Error,
    Number,
    String,
    Boolean,
    console,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };

  runInNewContext(secCompiled, baseCtx);

  const lockExports = {};
  const lockSource = readFileSync(new URL('../src/MobileLockScreen.tsx', import.meta.url), 'utf8');
  const lockCompiled = ts.transpileModule(lockSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'h',
      jsxFragmentFactory: 'fragment',
    },
  }).outputText;

  let states = [];
  let refs = [];
  let callbacks = [];
  let effectsRun = [];
  let cleanups = [];
  let stateIdx = 0;
  let refIdx = 0;
  let cbIdx = 0;
  let effectIdx = 0;

  const hooks = {
    useState(initial) {
      const slot = stateIdx++;
      if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
      const setter = (next) => {
        states[slot] = typeof next === 'function' ? next(states[slot]) : next;
      };
      return [states[slot], setter];
    },
    useRef(initial) {
      const slot = refIdx++;
      if (!(slot in refs)) refs[slot] = { current: initial };
      return refs[slot];
    },
    useCallback(fn, deps) {
      const slot = cbIdx++;
      const prev = callbacks[slot];
      if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
        callbacks[slot] = { fn, deps };
      }
      return callbacks[slot].fn;
    },
    useEffect(fn, deps) {
      const slot = effectIdx++;
      const prev = effectsRun[slot];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      if (changed) {
        if (typeof cleanups[slot] === 'function') cleanups[slot]();
        effectsRun[slot] = deps;
        cleanups[slot] = fn();
      }
    },
    useId() {
      return ':lock-title:';
    },
  };

  const h = (type, props, ...children) => ({ type, props: props ?? {}, children });

  runInNewContext(lockCompiled, {
    ...baseCtx,
    exports: lockExports,
    h,
    fragment: 'fragment',
    require: (id) => {
      if (id === 'react') return hooks;
      if (id === './mobileSecurity') return secExports;
      if (id === './store') return { emptyState: () => ({}), saveState: async () => {} };
      throw new Error('Unexpected import in MobileLockScreen: ' + id);
    },
  });

  const mount = (onUnlock = () => {}) => {
    states = [];
    refs = [];
    callbacks = [];
    effectsRun = [];
    cleanups = [];
    const render = () => {
      stateIdx = 0;
      refIdx = 0;
      cbIdx = 0;
      effectIdx = 0;
      return lockExports.MobileLockScreen({ onUnlock });
    };
    const unmount = () => {
      for (const fn of cleanups) {
        if (typeof fn === 'function') fn();
      }
      cleanups = [];
    };
    return { render, unmount };
  };

  return { sec: secExports, localMap, sessionMap, mount, getBioCalls: () => bioCalls };
}

function findNodes(node, pred, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (pred(node)) acc.push(node);
  for (const child of node.children?.flat(Infinity) ?? []) findNodes(child, pred, acc);
  return acc;
}

function nodeText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  return nodeText(node.children ?? []);
}

test('mobileSecurity persists pinLength for 4-12 digit PINs, clears on disable, and heals legacy configs on unlock', async () => {
  const { sec, localMap } = createLockTestEnv();

  await sec.setSecurityPasscode('12345678');
  assert.equal(sec.loadSecurityConfig().pinLength, 8);

  await sec.setSecurityPasscode('123456789012');
  assert.equal(sec.loadSecurityConfig().pinLength, 12);

  await assert.rejects(sec.setSecurityPasscode('123'));
  await assert.rejects(sec.setSecurityPasscode('1234567890123'));
  await assert.rejects(sec.setSecurityPasscode('abcd1234'));

  sec.disableSecurity();
  assert.equal(sec.loadSecurityConfig().pinLength, undefined);

  // Legacy PBKDF2 config without pinLength should heal to pinLength === 8 on successful verification
  const legacySalt = 'legacySalt123';
  const legacyHash = await sec.hashPasscode('12345678', legacySalt);
  localMap.set(
    'ack-deck.mobile-security.v1',
    JSON.stringify({
      enabled: true,
      salt: legacySalt,
      passcodeHash: legacyHash,
      biometricsEnabled: false,
      autoLockTimeoutSeconds: 0,
    })
  );
  assert.equal(sec.loadSecurityConfig().pinLength, undefined);
  assert.equal(await sec.verifySecurityPasscode('123456'), false);
  assert.equal(sec.loadSecurityConfig().pinLength, undefined);
  assert.equal(await sec.verifySecurityPasscode('12345678'), true);
  assert.equal(sec.loadSecurityConfig().pinLength, 8);

  // Invalid persisted pinLength values are ignored safely
  localMap.set(
    'ack-deck.mobile-security.v1',
    JSON.stringify({
      enabled: true,
      salt: legacySalt,
      passcodeHash: legacyHash,
      biometricsEnabled: false,
      autoLockTimeoutSeconds: 0,
      pinLength: 99,
    })
  );
  assert.equal(sec.loadSecurityConfig().pinLength, undefined);

  // Legacy single-round SHA-256 config without pinLength upgrades hash to PBKDF2 AND repairs pinLength
  const shaSalt = 'shaSalt456';
  const shaDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${shaSalt}:1234567890`));
  const shaHex = Array.from(new Uint8Array(shaDigest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  localMap.set(
    'ack-deck.mobile-security.v1',
    JSON.stringify({
      enabled: true,
      salt: shaSalt,
      passcodeHash: shaHex,
      biometricsEnabled: false,
      autoLockTimeoutSeconds: 0,
    })
  );
  assert.equal(await sec.verifySecurityPasscode('1234567890'), true);
  const upgraded = sec.loadSecurityConfig();
  assert.equal(upgraded.pinLength, 10);
  assert.match(upgraded.passcodeHash, /^pbkdf2\$/);
});

test('MobileLockScreen supports 8 and 12 digit PINs, compact dots, explicit Onayla confirm, legacy unlock, and single-prompt Face ID', async () => {
  const css = readFileSync(new URL('../src/styles/lock-pomodoro.css', import.meta.url), 'utf8');
  assert.match(css, /\.lock-dots-display\.is-compact/);
  assert.match(css, /\.lock-confirm-btn/);

  const lockSrc = readFileSync(new URL('../src/MobileLockScreen.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(lockSrc, /pin\.length\s*>=\s*8/);
  assert.doesNotMatch(lockSrc, /nextPin\.length\s*>=\s*6/);
  assert.match(lockSrc, /globalBiometricsPrompted\s*=\s*true/);

  // 1. Known 8-digit PIN does not fail at 6 and unlocks on 8th digit
  {
    const env = createLockTestEnv();
    await env.sec.setSecurityPasscode('12345678');
    env.sec.lockSecurity();
    let unlocked = 0;
    const { render, unmount } = env.mount(() => {
      unlocked += 1;
    });

    let tree = render();
    const hasClass = (node, cls) => String(node.props?.className ?? '').split(/\s+/).includes(cls);
    const dotsWrap = findNodes(tree, (n) => hasClass(n, 'lock-dots-display'))[0];
    assert.ok(hasClass(dotsWrap, 'is-compact'));
    assert.equal(findNodes(dotsWrap, (n) => hasClass(n, 'lock-dot')).length, 8);

    const confirmBtn0 = findNodes(tree, (n) => hasClass(n, 'lock-confirm-btn'))[0];
    assert.ok(confirmBtn0, 'Expected explicit Onayla confirm button');
    assert.equal(confirmBtn0.props.disabled, true);

    const clickDigit = (d) => {
      const btn = findNodes(tree, (n) => n.type === 'button' && hasClass(n, 'lock-key') && nodeText(n) === d)[0];
      btn.props.onClick();
      tree = render();
    };

    for (const d of ['1', '2', '3', '4', '5', '6']) {
      clickDigit(d);
    }
    await new Promise((r) => setTimeout(r, 80));
    tree = render();
    assert.equal(unlocked, 0);
    assert.equal(findNodes(tree, (n) => n.props?.className === 'lock-error-text').length, 0);
    const confirmBtn6 = findNodes(tree, (n) => hasClass(n, 'lock-confirm-btn'))[0];
    assert.equal(confirmBtn6.props.disabled, false);

    clickDigit('7');
    clickDigit('8');
    for (let i = 0; i < 10 && unlocked === 0; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(unlocked, 1);
    unmount();
  }

  // 2. Known 12-digit PIN renders 12 dots and unlocks on 12th digit
  {
    const env = createLockTestEnv();
    await env.sec.setSecurityPasscode('123456789012');
    env.sec.lockSecurity();
    let unlocked = 0;
    const { render, unmount } = env.mount(() => {
      unlocked += 1;
    });
    let tree = render();
    const hasClass = (node, cls) => String(node.props?.className ?? '').split(/\s+/).includes(cls);
    assert.equal(findNodes(tree, (n) => hasClass(n, 'lock-dot')).length, 12);

    for (const d of '123456789012') {
      const btn = findNodes(tree, (n) => n.type === 'button' && hasClass(n, 'lock-key') && nodeText(n) === d)[0];
      btn.props.onClick();
      tree = render();
    }
    for (let i = 0; i < 10 && unlocked === 0; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(unlocked, 1);
    unmount();
  }

  // 3. Legacy unknown-length 8-digit PIN typed fast unlocks without error and heals pinLength
  {
    const env = createLockTestEnv();
    const salt = 'fastSalt';
    const hash = await env.sec.hashPasscode('12345678', salt);
    env.localMap.set(
      'ack-deck.mobile-security.v1',
      JSON.stringify({ enabled: true, salt, passcodeHash: hash, biometricsEnabled: false, autoLockTimeoutSeconds: 0 })
    );
    let unlocked = 0;
    const { render, unmount } = env.mount(() => {
      unlocked += 1;
    });
    let tree = render();
    const hasClass = (node, cls) => String(node.props?.className ?? '').split(/\s+/).includes(cls);
    for (const d of '12345678') {
      const btn = findNodes(tree, (n) => n.type === 'button' && hasClass(n, 'lock-key') && nodeText(n) === d)[0];
      btn.props.onClick();
      tree = render();
    }
    for (let i = 0; i < 12 && unlocked === 0; i++) await new Promise((r) => setTimeout(r, 25));
    tree = render();
    assert.equal(unlocked, 1);
    assert.equal(env.sec.loadSecurityConfig().pinLength, 8);
    assert.equal(findNodes(tree, (n) => n.props?.className === 'lock-error-text').length, 0);
    unmount();
  }

  // 4. Explicit Onayla works alongside biometricsEnabled & Face ID auto-prompt runs once per lock session
  {
    const env = createLockTestEnv({ biometricsAvailable: true, authResult: false });
    const salt = 'bioSalt';
    const hash = await env.sec.hashPasscode('12345678', salt);
    env.localMap.set(
      'ack-deck.mobile-security.v1',
      JSON.stringify({
        enabled: true,
        salt,
        passcodeHash: hash,
        biometricsEnabled: true,
        biometricsCredentialId: 'AQIDBA',
        autoLockTimeoutSeconds: 0,
      })
    );

    const hasClass = (node, cls) => String(node.props?.className ?? '').split(/\s+/).includes(cls);
    const m1 = env.mount(() => {});
    let tree = m1.render();
    assert.ok(findNodes(tree, (n) => hasClass(n, 'lock-faceid-btn')).length === 1);
    assert.ok(findNodes(tree, (n) => n.props?.['aria-label'] === 'Sil').length === 1);
    assert.ok(findNodes(tree, (n) => hasClass(n, 'lock-confirm-btn')).length === 1);

    // Wait for auto Face ID timer once
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(env.getBioCalls(), 1);
    m1.unmount();

    // Remount before unlock: globalBiometricsPrompted prevents double-prompt
    const m2 = env.mount(() => {});
    tree = m2.render();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(env.getBioCalls(), 1);

    // Wrong 4-digit PIN + explicit Onayla click shows Turkish error
    for (const d of '9999') {
      const btn = findNodes(tree, (n) => n.type === 'button' && hasClass(n, 'lock-key') && nodeText(n) === d)[0];
      btn.props.onClick();
      tree = m2.render();
    }
    const confirmBtn = findNodes(tree, (n) => hasClass(n, 'lock-confirm-btn'))[0];
    confirmBtn.props.onClick();
    await new Promise((r) => setTimeout(r, 80));
    tree = m2.render();
    const errNode = findNodes(tree, (n) => n.props?.className === 'lock-error-text')[0];
    assert.match(nodeText(errNode), /Hatalı şifre/);
    m2.unmount();

    // Re-locking resets globalBiometricsPrompted so next mount prompts once again
    env.sec.lockSecurity();
    const m3 = env.mount(() => {});
    m3.render();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(env.getBioCalls(), 2);
    m3.unmount();
  }

  // 5. Legacy unknown-length wrong 12-digit PIN fails at 12, ignores 13th digit, Delete works, and Onayla works without biometrics
  {
    const env = createLockTestEnv({ biometricsAvailable: false });
    const salt = 'twelveSalt';
    const hash = await env.sec.hashPasscode('111122223333', salt);
    env.localMap.set(
      'ack-deck.mobile-security.v1',
      JSON.stringify({ enabled: true, salt, passcodeHash: hash, biometricsEnabled: false, autoLockTimeoutSeconds: 0 })
    );
    const { render, unmount } = env.mount(() => {});
    let tree = render();
    const hasClass = (node, cls) => String(node.props?.className ?? '').split(/\s+/).includes(cls);

    assert.equal(findNodes(tree, (n) => hasClass(n, 'lock-faceid-btn')).length, 0);
    assert.equal(findNodes(tree, (n) => hasClass(n, 'lock-confirm-btn')).length, 1);

    const clickDigit = (d) => {
      const btn = findNodes(tree, (n) => n.type === 'button' && hasClass(n, 'lock-key') && nodeText(n) === d)[0];
      btn.props.onClick();
      tree = render();
    };
    const clickDelete = () => {
      const btn = findNodes(tree, (n) => n.props?.['aria-label'] === 'Sil')[0];
      btn.props.onClick();
      tree = render();
    };

    clickDigit('9');
    clickDigit('8');
    clickDelete();
    assert.equal(findNodes(tree, (n) => hasClass(n, 'is-filled')).length, 1);
    clickDelete();
    assert.equal(findNodes(tree, (n) => hasClass(n, 'is-filled')).length, 0);

    for (const d of '999999999999') clickDigit(d);
    assert.equal(findNodes(tree, (n) => hasClass(n, 'lock-dot')).length, 12);
    // 13th digit should be ignored
    clickDigit('5');
    assert.equal(findNodes(tree, (n) => hasClass(n, 'is-filled')).length, 12);

    await new Promise((r) => setTimeout(r, 80));
    tree = render();
    const errNode = findNodes(tree, (n) => n.props?.className === 'lock-error-text')[0];
    assert.match(nodeText(errNode), /Hatalı şifre/);
    assert.equal(findNodes(tree, (n) => hasClass(n, 'is-filled')).length, 0);
    unmount();
  }
});

test('Task 9 Part B: Mobile settings, media, and SendCard remove dark-only inline colors and support light theme contrast', () => {
  const forbiddenInline = [
    /color:\s*["']#(fff|ffffff|f8fafc|f1f5f9|e2e8f0|e0e7ff|94a3b8|93c5fd|f87171|fca5a5|4ade80|34d399|c084fc|fbbf24|38bdf8|60a5fa)["']/i,
    /background:\s*["']rgba\(\s*0,\s*0,\s*0,\s*0\.25\s*\)["']/,
    /rgba\(\s*255,\s*255,\s*255,\s*0\.0[2-8]/,
    /--app-text-muted/,
  ];

  for (const rel of [
    '../src/MobileSettings.tsx',
    '../src/MobileMediaAiAssistant.tsx',
    '../src/MobileMediaTracker.tsx',
    '../src/MobileMediaCards.tsx',
    '../src/MobileMediaModals.tsx',
    '../src/SendCard.tsx',
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    for (const pattern of forbiddenInline) {
      assert.doesNotMatch(src, pattern, `${rel} still contains light-theme-breaking inline pattern ${pattern}`);
    }
  }

  const timelineCss = readFileSync(new URL('../src/styles/timeline-settings.css', import.meta.url), 'utf8');
  const lightVars = timelineCss.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/);
  assert.ok(lightVars, 'Expected :root[data-theme="light"] variable block');
  assert.match(lightVars[1], /--app-success:/);
  assert.match(lightVars[1], /--app-warning:/);
  assert.match(lightVars[1], /--app-danger:/);

  const mediaAiCss = readFileSync(new URL('../src/styles/media-ai.css', import.meta.url), 'utf8');
  assert.doesNotMatch(mediaAiCss, /--app-text-muted/);
  assert.match(mediaAiCss, /\.mobile-media-row-title\s*\{[^}]*var\(--app-text\)/);
  assert.match(mediaAiCss, /\.mobile-ai-history-item-title\s*\{[^}]*var\(--app-text\)/);
  assert.match(mediaAiCss, /\.mobile-ai-key-drawer\s*\{[^}]*var\(--app-(control|surface-elevated)/);
});

test('Task 9 Part B: MobileAiChat removes phone-side api/ai/key forms and shows read-only Turkish desktop instruction', async () => {
  const chatSrc = readFileSync(new URL('../src/MobileAiChat.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(chatSrc, /"ai\/key"|'ai\/key'/);
  assert.doesNotMatch(chatSrc, /saveCloudKey|removeCloudKey|Buluttaki Anahtarı Kaldır/);
  assert.doesNotMatch(chatSrc, /mobile-ai-key-form/);
  assert.match(chatSrc, /"ai\/status"/);
  assert.match(chatSrc, /ACKDeck Masaüstü[\s\S]*Ayarlar[\s\S]*Telefon[\s\S]*Mobil ACK AI \(7\/24\) Etkinleştir/);

  const calls = [];
  const collectText = (node) => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (!node || typeof node !== 'object') return '';
    return (node.children ?? []).flat(Infinity).map(collectText).join(' ');
  };
  const findAll = (node, pred, acc = []) => {
    if (!node || typeof node !== 'object') return acc;
    if (pred(node)) acc.push(node);
    for (const child of node.children?.flat(Infinity) ?? []) findAll(child, pred, acc);
    return acc;
  };

  for (const configured of [false, true]) {
    calls.length = 0;
    const chat = mountMobileAiChat({
      apiImpl: async (_state, path) => {
        calls.push(path);
        if (path === 'ai/status') return { configured };
        throw new Error('Unexpected call: ' + path);
      },
    });
    let tree = chat.render();
    await new Promise((r) => setImmediate(r));
    tree = chat.render();

    const badge = findAll(tree, (n) => n.type === 'button' && String(n.props?.className ?? '').includes('mobile-ai-mode-badge'))[0];
    assert.ok(badge, 'Expected mode badge button');
    badge.props.onClick();
    tree = chat.render();

    const drawer = findAll(tree, (n) => n.props?.className === 'mobile-ai-key-drawer')[0];
    assert.ok(drawer, 'Expected read-only status drawer to open on click');
    assert.equal(findAll(drawer, (n) => n.type === 'form' || n.type === 'input').length, 0, 'Drawer must not render key form or input');
    const drawerText = collectText(drawer);
    assert.match(drawerText, /ACKDeck Masaüstü.*Ayarlar.*Telefon.*Mobil ACK AI \(7\/24\) Etkinleştir/);
    if (configured) {
      assert.match(drawerText, /7\/24 Bulut AI etkin|aktif/i);
    } else {
      assert.match(drawerText, /7\/24 Bulut AI kapalı|Yalnızca PC/i);
    }
    assert.deepEqual(calls, ['ai/status']);
  }
});

test('Task 9 Fix Round 1: media-ai.css drawers, dropdowns, topbar badges, and surfaces use semantic light-theme tokens', () => {
  const mediaAiCss = readFileSync(new URL('../src/styles/media-ai.css', import.meta.url), 'utf8');

  const getRuleBlock = (selectorPattern) => {
    const match = mediaAiCss.match(new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`));
    assert.ok(match, `Expected CSS rule matching ${selectorPattern}`);
    return match[1];
  };

  for (const selector of ['\\.mobile-ai-history-drawer', '\\.mobile-media-suggestions']) {
    const block = getRuleBlock(selector);
    assert.doesNotMatch(block, /rgba\(\s*(18,\s*18,\s*22|15,\s*23,\s*42)/);
    assert.match(block, /background:\s*var\(--app-surface-elevated\)/);
  }

  for (const selector of [
    '\\.mobile-type-btn',
    '\\.mobile-media-preview-box,\\s*\\.mobile-media-poster-preview',
    '\\.mobile-ai-key-btn,\\s*\\.mobile-ai-clear-btn,\\s*\\.mobile-ai-history-btn',
    '\\.mobile-ai-starter-chip',
    '\\.mobile-ai-bubble\\.is-model',
  ]) {
    const block = getRuleBlock(selector);
    assert.doesNotMatch(block, /rgba\(\s*255,\s*255,\s*255,\s*0\.0[1-9]/);
    assert.match(block, /background:\s*var\(--app-control\)/);
    assert.match(block, /border[^:]*:[^;]*var\(--app-border/);
  }

  const selectBlock = getRuleBlock('\\.mobile-ai-model-select');
  assert.doesNotMatch(selectBlock, /rgba\(\s*0,\s*0,\s*0,\s*0\.25\s*\)/);
  assert.match(selectBlock, /background:\s*var\(--app-field\)/);
  assert.match(selectBlock, /border:\s*1px solid var\(--app-border\)/);

  const readyBlock = getRuleBlock('\\.mobile-ai-mode-badge\\.is-ready');
  assert.doesNotMatch(readyBlock, /#6ee7b7/i);
  assert.match(readyBlock, /color:\s*var\(--app-success\)/);

  const warnBlock = getRuleBlock('\\.mobile-ai-mode-badge\\.is-warn');
  assert.doesNotMatch(warnBlock, /#fde047/i);
  assert.match(warnBlock, /color:\s*var\(--app-warning\)/);

  const activeHistoryBlock = getRuleBlock('\\.mobile-ai-history-btn\\.is-active');
  assert.doesNotMatch(activeHistoryBlock, /#93c5fd/i);
  assert.match(activeHistoryBlock, /background:\s*var\(--app-accent-soft\)/);
  assert.match(activeHistoryBlock, /border-color:\s*var\(--app-accent-border\)/);
  assert.match(activeHistoryBlock, /color:\s*var\(--app-accent\)/);

  assert.match(mediaAiCss, /:root\[data-theme="light"\]\s+\.mobile-ai-mode-badge\.is-ready/);
  assert.match(mediaAiCss, /:root\[data-theme="light"\]\s+\.mobile-ai-mode-badge\.is-warn/);
});

test('Task 10 Fix Round 1: useMobileAppController splits cleanly under size limits and MobileMediaFormModal suppresses lookup cleanly under StrictMode', async () => {
  const lineCount = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').split(/\r?\n/).length;
  assert.ok(lineCount('../src/useMobileAppController.ts') < 220, 'useMobileAppController.ts must stay under 220 lines');
  assert.ok(lineCount('../src/useMobileSync.ts') < 320, 'useMobileSync.ts must stay under 320 lines');
  assert.ok(lineCount('../src/useMobileEditor.ts') < 320, 'useMobileEditor.ts must stay under 320 lines');
  assert.ok(lineCount('../src/useMobileSend.ts') < 320, 'useMobileSend.ts must stay under 320 lines');
  assert.ok(lineCount('../src/main.tsx') < 550, 'main.tsx must stay under 550 lines');

  const ctrlSrc = readFileSync(new URL('../src/useMobileAppController.ts', import.meta.url), 'utf8');
  assert.match(ctrlSrc, /useMobileSync/);
  assert.match(ctrlSrc, /useMobileEditor/);
  assert.match(ctrlSrc, /useMobileSend/);

  const modalSrc = readFileSync(new URL('../src/MobileMediaModals.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(modalSrc, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'h',
      jsxFragmentFactory: 'fragment',
    },
  }).outputText;

  function mountMobileModal(initialEditor, initialSuppressLookup) {
    const states = [];
    const refs = [];
    const effects = [];
    const cleanups = [];
    const pendingTimers = new Map();
    let timerId = 1;
    let stateIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;
    let currentEditor = initialEditor;
    const lookupCalls = [];

    const hooks = {
      useState(init) {
        const slot = stateIdx++;
        if (!(slot in states)) states[slot] = typeof init === 'function' ? init() : init;
        return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
      },
      useRef(init) {
        const slot = refIdx++;
        if (!(slot in refs)) refs[slot] = { current: init };
        return refs[slot];
      },
      useEffect(fn, deps) {
        const slot = effectIdx++;
        const prev = effects[slot];
        const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
        effects[slot] = { fn, deps, changed };
      },
    };

    const exports = {};
    const h = (type, props, ...children) => ({ type, props: props ?? {}, children });
    runInNewContext(compiled, {
      exports,
      h,
      fragment: 'fragment',
      window: {
        setTimeout(fn) {
          const id = timerId++;
          pendingTimers.set(id, fn);
          return id;
        },
        clearTimeout(id) {
          pendingTimers.delete(id);
        },
      },
      AbortController,
      Date,
      Promise,
      require: (id) => {
        if (id === 'react') return hooks;
        if (id === '../../shared/media') {
          return {
            MEDIA_TYPE_ICONS: { movie: '🎬', series: '📺', book: '📚', game: '🎮' },
            MEDIA_TYPE_LABELS: { movie: 'Film', series: 'Dizi', book: 'Kitap', game: 'Oyun' },
          };
        }
        if (id === '../../shared/mediaSearch') {
          return {
            proxyPosterUrl: (u) => u,
            searchMediaCatalog: async (type, q) => {
              lookupCalls.push({ type, q });
              return [{ title: 'Dune', suggestedType: 'movie', year: '2021', creator: 'Denis Villeneuve' }];
            },
            fetchMediaRating: async () => null,
          };
        }
        throw new Error('Unexpected import: ' + id);
      },
    });

    const render = (strictDouble = false) => {
      stateIdx = 0;
      refIdx = 0;
      effectIdx = 0;
      const tree = exports.MobileMediaFormModal({
        editor: currentEditor,
        isEditingExisting: initialSuppressLookup,
        initialSuppressLookup,
        onChangeEditor: (updater) => {
          currentEditor = typeof updater === 'function' ? updater(currentEditor) : updater;
        },
        onClose: () => {},
        onSave: () => {},
        onDelete: () => {},
      });
      for (let i = 0; i < effects.length; i++) {
        if (!effects[i].changed) continue;
        cleanups[i]?.();
        cleanups[i] = effects[i].fn();
        if (strictDouble) {
          cleanups[i]?.();
          cleanups[i] = effects[i].fn();
        }
      }
      return tree;
    };

    const flushTimers = async () => {
      for (const [id, fn] of [...pendingTimers.entries()]) {
        pendingTimers.delete(id);
        fn();
      }
      await new Promise((r) => setImmediate(r));
    };

    return {
      render,
      flushTimers,
      lookupCalls,
      setEditorTitle: (title) => { currentEditor = { ...currentEditor, title }; },
    };
  }

  // 1. StrictMode double-effect keeps initial lookup suppressed; editing title clears suppression
  const mm1 = mountMobileModal({ id: 'mm1', type: 'movie', title: 'Interstellar', status: 'completed', createdAt: 1, updatedAt: 1 }, true);
  mm1.render(true);
  await mm1.flushTimers();
  assert.equal(mm1.lookupCalls.length, 0, 'StrictMode double-effect must keep initial lookup suppressed');
  mm1.setEditorTitle('Interstellar 2');
  mm1.render(false);
  await mm1.flushTimers();
  assert.deepEqual(mm1.lookupCalls, [{ type: 'movie', q: 'Interstellar 2' }]);

  // 2. Selecting candidate with identical type+title must not swallow subsequent user edit
  const mm2 = mountMobileModal({ id: 'mm2', type: 'movie', title: 'Dune', status: 'planned', createdAt: 1, updatedAt: 1 }, false);
  mm2.render(false);
  await mm2.flushTimers();
  const tree2 = mm2.render(false);
  assert.equal(mm2.lookupCalls.length, 1);

  const findSuggestion = (node) => {
    if (!node || typeof node !== 'object') return null;
    if (String(node.props?.className ?? '').includes('mobile-media-suggestion-item')) return node;
    for (const child of node.children?.flat(Infinity) ?? []) {
      const hit = findSuggestion(child);
      if (hit) return hit;
    }
    return null;
  };
  const sugBtn = findSuggestion(tree2);
  assert.ok(sugBtn);
  sugBtn.props.onClick();
  mm2.render(false);
  await mm2.flushTimers();
  assert.equal(mm2.lookupCalls.length, 1);

  mm2.setEditorTitle('Dune 2');
  mm2.render(false);
  await mm2.flushTimers();
  assert.deepEqual(mm2.lookupCalls, [
    { type: 'movie', q: 'Dune' },
    { type: 'movie', q: 'Dune 2' },
  ]);
});

test('Final Cleanup Wave: mobile composer input uses 16px !important and dead handleMobileChangeCity is removed', () => {
  const mediaAiCss = readFileSync(new URL('../src/styles/media-ai.css', import.meta.url), 'utf8');
  const composerMatch = mediaAiCss.match(/\.mobile-ai-composer input\s*\{([^}]*)\}/);
  assert.ok(composerMatch, 'Expected .mobile-ai-composer input CSS rule');
  assert.match(composerMatch[1], /font-size:\s*16px\s*!important/);

  const helpersSrc = readFileSync(new URL('../src/mobileAppHelpers.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(helpersSrc, /handleMobileChangeCity/);
});
