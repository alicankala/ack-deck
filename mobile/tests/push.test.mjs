import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function pushRuntime({installed=true,permission='granted',fail=false}={}) {
  const calls=[],key=new Uint8Array(65);key[0]=4;
  const vapid=Buffer.from(key).toString('base64url');
  const exports={};
  const Notification={permission,requestPermission:async()=>{calls.push('permission');return 'granted';}};
  const subscription={toJSON:()=>({endpoint:'https://web.push.apple.com/fixture',expirationTime:null,keys:{p256dh:'test',auth:'test'}})};
  const registration={pushManager:{getSubscription:async()=>null,subscribe:async options=>{calls.push(options);if(fail)throw Error('native failure');return subscription;}}};
  const navigator={userAgent:'iPhone',serviceWorker:{ready:Promise.resolve(registration)}};
  const source=readFileSync(new URL('../src/push.ts',import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({json:body=>body,api:async(_state,path,body)=>{calls.push(path);if(path==='status')return{vapidPublicKey:vapid};assert.equal(body.endpoint,subscription.toJSON().endpoint);return{ok:true};}}),navigator,window:{PushManager:{},Notification},Notification,matchMedia:()=>({matches:installed}),atob,Uint8Array});
  return{exports,calls};
}

test('installed iPhone subscribes with a decoded 65-byte VAPID key and persists through authenticated API',async()=>{
  const env=pushRuntime();await env.exports.enablePush({token:'paired-fixture'});
  assert.equal(env.calls[0],'status');const options=env.calls.find(value=>typeof value==='object');assert.equal(options.userVisibleOnly,true);assert.equal(options.applicationServerKey.length,65);assert.equal(options.applicationServerKey[0],4);assert.equal(env.calls.at(-1),'push');
});
test('Home Screen and permission gates precede network; native subscription errors stay Turkish',async()=>{
  const uninstalled=pushRuntime({installed:false});await assert.rejects(uninstalled.exports.enablePush({}),/Ana Ekran/);assert.equal(uninstalled.calls.length,0);
  const denied=pushRuntime({permission:'denied'});await assert.rejects(denied.exports.enablePush({}),/Bildirim izni verilmedi/);assert.equal(denied.calls.length,0);
  const failed=pushRuntime({fail:true});await assert.rejects(failed.exports.enablePush({}),/Bildirim aboneliği oluşturulamadı/);assert.ok(!failed.calls.includes('push'));
});
test('service worker displays decoded push and notification click stays on the relevant ACKDeck task',async()=>{
  const handlers={},shown=[],navigation=[],origin='https://ack.example';
  const self={location:{origin},addEventListener:(type,handler)=>handlers[type]=handler,registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[{url:origin+'/',navigate:async url=>navigation.push(url),focus:async()=>{}}],openWindow:async url=>navigation.push(url)}};
  runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Response});
  let pending;handlers.push({data:{json:()=>({body:'SD kart al',url:'/#task=task-1',tag:'one'})},waitUntil:value=>pending=value});await pending;
  assert.equal(shown[0].title,'ACKDeck');assert.equal(shown[0].options.body,'SD kart al');
  handlers.notificationclick({notification:{close:()=>{},data:shown[0].options.data},waitUntil:value=>pending=value});await pending;assert.equal(navigation[0],origin+'/#task=task-1');
  handlers.push({data:{json:()=>{throw Error('damaged payload');}},waitUntil:()=>assert.fail('malformed payload must not display raw content')});
});
