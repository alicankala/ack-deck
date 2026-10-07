import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function runtime(status=200){
  const states=[],refs=[],effects=[],calls=[],revoked=[];let stateIndex=0,refIndex=0;
  const h=(type,props,...children)=>({type,props:props??{},children});
  const hooks={useState:initial=>{const slot=stateIndex++;if(!(slot in states))states[slot]=initial;return[states[slot],value=>states[slot]=value];},useRef:initial=>{const slot=refIndex++;return refs[slot]??(refs[slot]={current:initial});},useEffect:effect=>effects.push(effect)};
  const files=[{id:'voice-1',name:'Ses.ogg',mime:'audio/ogg',size:100}],exports={},shared={};
  const compilerOptions={module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'h'};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../../shared/productivity.ts',import.meta.url),'utf8'),{compilerOptions}).outputText,{exports:shared});
  const context={exports,h,require:name=>name==='react'?hooks:shared,AbortController,clearTimeout,URL:{createObjectURL:()=> 'blob:safe-preview',revokeObjectURL:url=>revoked.push(url)},window:{setTimeout,clearTimeout},fetch:async(url,options)=>{calls.push({url,options});return {ok:status===200,status,headers:new Headers({'content-type':'audio/ogg'}),blob:async()=>new Blob(['x'.repeat(100)],{type:'audio/ogg'})};}};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/NoteAttachments.tsx',import.meta.url),'utf8'),{compilerOptions}).outputText,context);
  const render=()=>{stateIndex=refIndex=0;return exports.NoteAttachments({files,state:{token:'fake-paired-token'}});};
  function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of node.children?.flat(Infinity)??[]){const found=find(child,predicate);if(found)return found;}return null;}
  return{render,find,calls,revoked,effects};
}
test('a linked voice note fetches only after an explicit click, uses device auth, never autoplays and releases its URL',async()=>{
  const env=runtime();env.render();assert.equal(env.calls.length,0);
  env.find(env.render(),n=>n.type==='button').props.onClick();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(env.calls.length,1);assert.equal(env.calls[0].url,'/api/attachments/voice-1');assert.equal(env.calls[0].options.headers.Authorization,'Bearer fake-paired-token');
  const audio=env.find(env.render(),n=>n.type==='audio');assert.equal(audio.props.controls,true);assert.equal(audio.props.autoPlay,undefined);assert.equal(audio.props.src,'blob:safe-preview');
  const cleanup=env.effects.at(-1)();cleanup();assert.deepEqual(env.revoked,['blob:safe-preview']);
});
test('an expired cloud attachment shows an honest error and retains the note attachment for retry',async()=>{
  const env=runtime(410);env.find(env.render(),n=>n.type==='button').props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const view=env.render();assert.match(env.find(view,n=>n.props.role==='alert').children.join(''),/saklama süresi dolmuş/);assert.equal(env.find(view,n=>n.type==='audio'),null);assert.ok(env.find(view,n=>n.type==='button'));
});
