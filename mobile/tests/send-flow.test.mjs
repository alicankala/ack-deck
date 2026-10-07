import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
function load(){const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL('../src/sendFlow.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,crypto:webcrypto});return exports;}
test('attachment double taps send once; lost responses retry with the same id and successful drafts never resend',async()=>{
  const calls=[];let release,fail=true;
  const sender=load().createAttachmentSender(async(blob,name,id)=>{calls.push({blob,name,id});await new Promise(resolve=>release=resolve);if(fail)throw Error('response lost');});
  const blob=new Blob(['voice'],{type:'audio/ogg'});
  const first=sender(blob,'ses.ogg');assert.equal(await sender(blob,'ses.ogg'),false);release();await assert.rejects(first,/response lost/);
  fail=false;const retry=sender(blob,'ses.ogg');release();assert.equal(await retry,true);assert.equal(calls[0].id,calls[1].id);assert.equal(await sender(blob,'ses.ogg'),true);assert.equal(calls.length,2);
  const different=new Blob(['next']);const next=sender(different,'yeni.txt');release();await next;assert.notEqual(calls[2].id,calls[1].id);
});
test('send card keeps file on failure and clears it only after success, with one explicit upload action',async()=>{
  const exports={},states=[];let index=0,selected=new File(['PDF'],'plan.pdf',{type:'application/pdf'}),success=false,uploads=0;
  const h=(type,props,...children)=>({type,props:props??{},children});
  const hooks={useState:initial=>{const slot=index++;if(!(slot in states))states[slot]=typeof initial==='function'?initial():initial;return[states[slot],next=>states[slot]=next];},useEffect:()=>{}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/SendCard.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,jsxFactory:'h',jsxFragmentFactory:'fragment'}}).outputText,{exports,h,fragment:'fragment',require:name=>name==='react'?hooks:{Icon:()=>null}});
  const props=()=>({busy:false,recording:false,audio:null,file:selected,feedback:'',onSelectFile:file=>selected=file,onFile:async()=>{uploads++;return success;},onOpen(){},onRecord(){},onAudioSend(){},onAudioCancel(){}});
  const render=()=>{index=0;return exports.SendCard(props());};
  const find=(tree,fn)=>{if(!tree||typeof tree!=='object')return null;if(fn(tree))return tree;for(const child of tree.children?.flat(Infinity)??[]){const found=find(child,fn);if(found)return found;}return null;};
  let tree=render();assert.equal(uploads,0);
  const upload=()=>find(render(),node=>node.type==='button'&&node.children.includes('Dosyayı gönder')).props.onClick();
  upload();await new Promise(resolve=>setImmediate(resolve));assert.equal(selected.name,'plan.pdf');
  success=true;upload();await new Promise(resolve=>setImmediate(resolve));assert.equal(selected,null);assert.equal(uploads,2);
});
