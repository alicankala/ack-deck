import { useEffect } from "react";
import { configurePhone, phoneRequest, phoneStatus } from "./phoneClient";
import { synchronizePhone, pausePhoneSync } from "./phoneSync";
export function usePhoneCompanion(paused:boolean,onError:(message:string)=>void){
  useEffect(()=>{
    let active=true,enabled=false,timer:ReturnType<typeof setInterval>|undefined;
    async function run(){if(!active||!enabled||paused)return;try{await synchronizePhone();const result=await phoneRequest<{commands:unknown[]}>("commands");if(active&&result.commands.length)window.dispatchEvent(new CustomEvent("ack-phone-commands",{detail:result.commands}));}catch{if(active)onError("Telefon eşitlemesi tamamlanamadı. Yerel kayıtlar korunuyor.");}}
    async function configure(){pausePhoneSync(true);try{const status=await phoneStatus();if(!active)return;enabled=status.enabled&&status.configured&&window.localStorage.getItem("ack-deck.phone-restore-review.v1")===null;clearInterval(timer);pausePhoneSync(paused||!enabled);if(enabled&&!paused){void run();timer=setInterval(()=>void run(),60000);}}catch{enabled=false;clearInterval(timer);}}
    const pauseForRestore=(event:Event)=>{if((event as CustomEvent).detail===true)pausePhoneSync(true);};
    const restored=()=>{pausePhoneSync(true);enabled=false;clearInterval(timer);try{window.localStorage.setItem("ack-deck.phone-restore-review.v1","true");}catch{}void phoneStatus().then(status=>status.enabled?configurePhone(status.url,false):undefined).then(()=>window.dispatchEvent(new Event("ack-phone-configured"))).catch(()=>{});};
    window.addEventListener("ack-data-restored",restored);window.addEventListener("ack-restore-active",pauseForRestore);window.addEventListener("ack-phone-configured",configure);window.addEventListener("online",run);void configure();
    return()=>{active=false;pausePhoneSync(true);clearInterval(timer);window.removeEventListener("ack-data-restored",restored);window.removeEventListener("ack-restore-active",pauseForRestore);window.removeEventListener("ack-phone-configured",configure);window.removeEventListener("online",run);};
  },[paused,onError]);
}
