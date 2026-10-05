import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { phoneRequest } from "../phoneClient";
import { loadWorkspaces } from "../workHubStore";
import { launchWorkspace } from "../hubLaunch";
import { id } from "../../shared/phone";
import { phoneSyncPaused } from "../phoneSync";
type Command={id:string;workspaceId:string;createdAt:number;expiresAt:number;queuedOffline:number};
export function PhoneCommands({paused,onNotice}:{paused:boolean;onNotice:(text:string)=>void}){
  const [pending,setPending]=useState<Command[]>([]);const consumed=useRef(new Set<string>()),busy=useRef(false),pausedRef=useRef(paused);pausedRef.current=paused;
  async function execute(command:Command,approved:boolean){if(busy.current||pausedRef.current||phoneSyncPaused())return;busy.current=true;consumed.current.add(command.id);
    try{if(!approved){await phoneRequest("result",{id:command.id,result:"cancelled"});return;}if(command.expiresAt<=Date.now())throw new Error("Telefon isteğinin süresi dolmuş.");const workspace=loadWorkspaces().entries.find(row=>row.id===command.workspaceId);if(!workspace)throw new Error("Çalışma alanı bulunamadı.");const snapshot=JSON.stringify(workspace);const claim=await phoneRequest<{workspaceId:string;expiresAt:number}>("claim",{id:command.id});if(claim.workspaceId!==command.workspaceId||claim.expiresAt<=Date.now())throw new Error("Telefon isteği doğrulanamadı.");const result=await launchWorkspace(command.workspaceId,invoke,()=>{if(pausedRef.current||phoneSyncPaused()||Date.now()>=claim.expiresAt||JSON.stringify(loadWorkspaces().entries.find(row=>row.id===command.workspaceId))!==snapshot)throw new Error("Çalışma alanı değişti veya istek süresi doldu.");});await phoneRequest("result",{id:command.id,result:result.errors.length?"failed":"done"});onNotice(result.errors.length?result.errors.join(" "):"Telefondan istenen çalışma alanı açıldı.");}
    catch(error){onNotice(error instanceof Error?error.message:"Telefon isteği çalıştırılamadı.");await phoneRequest("result",{id:command.id,result:"failed"}).catch(()=>{});}finally{busy.current=false;setPending(rows=>rows.filter(row=>row.id!==command.id));}
  }
  useEffect(()=>{const receive=(event:Event)=>{const values=(event as CustomEvent).detail;if(!Array.isArray(values)||pausedRef.current)return;const commands=values.filter((value):value is Command=>value&&id(value.id)&&id(value.workspaceId)&&Number.isFinite(value.createdAt)&&Number.isFinite(value.expiresAt)&&[0,1].includes(value.queuedOffline)&&value.expiresAt>Date.now()&&!consumed.current.has(value.id));setPending(rows=>[...rows,...commands.filter(command=>!rows.some(row=>row.id===command.id))]);};window.addEventListener("ack-phone-commands",receive);return()=>window.removeEventListener("ack-phone-commands",receive);},[]);
  useEffect(()=>{const next=pending[0];if(!next||paused||busy.current)return;if(next.queuedOffline===0)void execute(next,true);else void invoke("show_main_window",{target:null}).catch(()=>{});},[pending,paused]);
  const current=pending[0];if(!current||current.queuedOffline===0||paused)return null;
  const workspace=loadWorkspaces().entries.find(row=>row.id===current.workspaceId);
  return <div className="restore-overlay"><section className="surface hub-card" role="dialog" aria-modal="true" aria-labelledby="phone-command-title"><h2 id="phone-command-title">Telefondan gelen istek</h2><p>{workspace?.name??"Çalışma alanı bulunamadı"} çalışma alanını aç</p><p>Bilgisayar çevrimdışıyken bırakılmış bu istek için onayınız gerekir.</p><div className="hub-actions"><button disabled={!workspace} onClick={()=>void execute(current,true)}>Çalıştır</button><button onClick={()=>void execute(current,false)}>İptal</button></div></section></div>;
}
