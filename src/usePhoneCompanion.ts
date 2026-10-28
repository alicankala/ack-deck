import { useEffect } from "react";
import { configurePhone, phoneRequest, phoneStatus } from "./phoneClient";
import { synchronizePhone, pausePhoneSync, isPhoneSyncRunning } from "./phoneSync";
import { saveInboxIndex, type InboxReference } from "./productIntelligence";
import { loadPrayerConfig } from "../shared/prayerTimes";
import { loadStudyReminders } from "./studyReminderStore";

export function usePhoneCompanion(paused:boolean,onError:(message:string)=>void,visible=true){
  useEffect(()=>{
    let active=true,enabled=false,timer:ReturnType<typeof setInterval>|undefined,heartbeatTimer:ReturnType<typeof setInterval>|undefined,changeTimer:ReturnType<typeof setTimeout>|undefined;
    let inFlight=false,lastErrorAlert=0;

    async function sendHeartbeat(forceOffline=false){
      if(!active||!enabled)return;
      if(forceOffline||!visible||paused){
        try{await phoneRequest("heartbeat",{offline:true});}catch{}
        return;
      }
      try{
        const studyRem=loadStudyReminders();
        await phoneRequest("heartbeat",{prayerConfig:loadPrayerConfig(),...(!studyRem.locked?{studyReminders:studyRem.entries}:{})});
      }catch(err){
        console.warn("[ACKDeck Heartbeat]",err);
      }
    }

    async function run(){
      if(!active||!enabled||paused||inFlight)return;
      inFlight=true;
      try{
        await synchronizePhone();
        const result=await phoneRequest<{commands:unknown[]}>("commands");
        if(active&&result.commands.length)window.dispatchEvent(new CustomEvent("ack-phone-commands",{detail:result.commands}));
        const inboxRes=await phoneRequest<{items:unknown[]}>("inbox").catch(()=>null);
        if(active&&inboxRes&&Array.isArray(inboxRes.items)){
          saveInboxIndex(inboxRes.items as InboxReference[]);
          window.dispatchEvent(new Event("ack-inbox-updated"));
        }
      }catch(err){
        console.warn("[ACKDeck Phone Sync]", err);
        const now = Date.now();
        if(active && now - lastErrorAlert > 300000){
          lastErrorAlert = now;
          onError("Telefon eşitlemesi tamamlanamadı. Yerel kayıtlar korunuyor.");
        }
      }finally{
        inFlight=false;
      }
    }
    async function configure(){
      pausePhoneSync(true);
      try{
        const status=await phoneStatus();
        if(!active)return;
        enabled=status.enabled&&status.configured&&window.localStorage.getItem("ack-deck.phone-restore-review.v1")===null;
        clearInterval(timer);
        clearInterval(heartbeatTimer);
        pausePhoneSync(paused||!enabled);
        if(enabled&&!paused){
          void sendHeartbeat();
          if(visible){
            heartbeatTimer=setInterval(()=>void sendHeartbeat(),20000);
          }
          void run();
          timer=setInterval(()=>void run(),30000);
        }
      }catch{
        enabled=false;
        clearInterval(timer);
        clearInterval(heartbeatTimer);
      }
    }
    const pauseForRestore=(event:Event)=>{if((event as CustomEvent).detail===true)pausePhoneSync(true);};
    const restored=()=>{pausePhoneSync(true);enabled=false;clearInterval(timer);clearInterval(heartbeatTimer);try{window.localStorage.setItem("ack-deck.phone-restore-review.v1","true");}catch{}void phoneStatus().then(status=>status.enabled?configurePhone(status.url,false):undefined).then(()=>window.dispatchEvent(new Event("ack-phone-configured"))).catch(()=>{});};
    const onPrayerLogsChanged=()=>{if(active&&enabled&&!paused&&!isPhoneSyncRunning()){void sendHeartbeat();void run();}};
    const onDataChanged=()=>{
      if(active&&enabled&&!paused&&!isPhoneSyncRunning()){
        clearTimeout(changeTimer);
        changeTimer=setTimeout(()=>void run(),400);
      }
    };
    const onWindowFocus=()=>{if(active&&enabled&&!paused){void sendHeartbeat();void run();}};

    const onBeforeUnload = () => {
      if (enabled) {
        try {
          void phoneRequest("heartbeat", { offline: true });
        } catch {}
      }
    };

    window.addEventListener("ack-data-restored",restored);
    window.addEventListener("ack-restore-active",pauseForRestore);
    window.addEventListener("ack-phone-configured",configure);
    window.addEventListener("ack-prayer-logs-changed",onPrayerLogsChanged);
    window.addEventListener("ack-data-changed",onDataChanged);
    window.addEventListener("focus",onWindowFocus);
    window.addEventListener("online",run);
    window.addEventListener("beforeunload",onBeforeUnload);
    void configure();

    return()=>{
      active=false;
      pausePhoneSync(true);
      clearInterval(timer);
      clearInterval(heartbeatTimer);
      clearTimeout(changeTimer);
      window.removeEventListener("ack-data-restored",restored);
      window.removeEventListener("ack-restore-active",pauseForRestore);
      window.removeEventListener("ack-phone-configured",configure);
      window.removeEventListener("ack-prayer-logs-changed",onPrayerLogsChanged);
      window.removeEventListener("ack-data-changed",onDataChanged);
      window.removeEventListener("focus",onWindowFocus);
      window.removeEventListener("online",run);
      window.removeEventListener("beforeunload",onBeforeUnload);
    };
  },[paused,onError,visible]);
}
