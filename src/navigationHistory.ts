import type { NavigationTarget } from "./navigation";

// History holds page references only. Captures and measurements must not run
// again when returning to a page that originally had a one-shot intent.
export const historyTarget = ({page,id}:NavigationTarget):NavigationTarget => id ? {page,id} : {page};
type Entry = { session:string; index:number };
export function createNavigationHistory(host:Window, initial:NavigationTarget, onNavigate:(target:NavigationTarget)=>void, blocked:()=>boolean) {
  const session=crypto.randomUUID(), entries=[historyTarget(initial)];
  let index=0, travelling=false, recovering=false, queued:NavigationTarget|undefined;
  const state=():Entry=>({session,index});
  host.history.replaceState(state(),"");
  function navigate(target:NavigationTarget) {
    if(travelling||recovering){queued=target;return;}
    const saved=historyTarget(target), current=entries[index];
    if(current.page!==saved.page||current.id!==saved.id||target.intent){
      entries.splice(index+1);entries.push(saved);index=entries.length-1;
      host.history.pushState(state(),"");
    }
    onNavigate(target);
  }
  function travel(direction:number) {
    if(travelling||recovering||blocked()||index+direction<0||index+direction>=entries.length)return;
    travelling=true;host.history.go(direction);
  }
  function pop(event:PopStateEvent) {
    const next=event.state as Partial<Entry>|null;
    if(next?.session!==session||!Number.isInteger(next.index)||next.index!<0||next.index!>=entries.length){
      // Ignore unrelated document/session history rather than replaying it.
      travelling=false;return;
    }
    travelling=false;
    if(recovering){recovering=false;}
    else if(blocked()&&next.index!==index){recovering=true;host.history.go(index-next.index!);return;}
    else if(next.index!==index){index=next.index!;onNavigate(entries[index]);}
    if(queued){const target=queued;queued=undefined;navigate(target);}
  }
  function mouse(event:MouseEvent) {
    if(event.button!==3&&event.button!==4)return;
    event.preventDefault();
    if(event.type==="mouseup")travel(event.button===3?-1:1);
  }
  function keyboard(event:KeyboardEvent) {
    const direction=event.key==="BrowserBack"||event.altKey&&event.key==="ArrowLeft"?-1:event.key==="BrowserForward"||event.altKey&&event.key==="ArrowRight"?1:0;
    if(!direction||event.isComposing)return;
    event.preventDefault();if(!event.repeat)travel(direction);
  }
  host.addEventListener("popstate",pop);
  host.addEventListener("mousedown",mouse,true);
  host.addEventListener("mouseup",mouse,true);
  host.addEventListener("auxclick",mouse,true);
  host.addEventListener("keydown",keyboard,true);
  return {navigate,dispose:()=>{
    host.removeEventListener("popstate",pop);
    host.removeEventListener("mousedown",mouse,true);
    host.removeEventListener("mouseup",mouse,true);
    host.removeEventListener("auxclick",mouse,true);
    host.removeEventListener("keydown",keyboard,true);
  }};
}

export function navigationIsBlocked(doc:Document,busy:boolean):boolean {
  if(busy||doc.activeElement?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return true;
  const visible=(element:Element)=>!element.closest('[hidden],[inert]')&&element.getClientRects().length>0;
  if(Array.from(doc.querySelectorAll('dialog[open],[role="dialog"],.ai-confirm,.backup-confirm,.file-remove-confirm,.task-delete-confirm,.project-confirm,.notes-delete-confirm,[data-navigation-dirty="true"]')).some(visible))return true;
  // These drafts persist only when submitted. Merely blurring the field must
  // not let a mouse Back button silently unmount and discard its contents.
  return Array.from(doc.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('#new-task,#ai-prompt,#gemini-key')).some(element=>visible(element)&&!!element.value.trim());
}
