import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigationTarget } from "./navigation";
import { createNavigationHistory, navigationIsBlocked } from "./navigationHistory";
export function useNavigationHistory(initial:NavigationTarget,busy:()=>boolean) {
  const [route,setRoute]=useState({target:initial,serial:0});
  const first=useRef(initial), guard=useRef(busy), controller=useRef<ReturnType<typeof createNavigationHistory>|null>(null);
  guard.current=busy;
  useEffect(()=>{
    const history=createNavigationHistory(window,first.current,target=>setRoute(previous=>({target,serial:previous.serial+1})),()=>navigationIsBlocked(document,guard.current()));
    controller.current=history;
    return()=>{history.dispose();controller.current=null;};
  },[]);
  const navigate=useCallback((target:NavigationTarget)=>controller.current?.navigate(target),[]);
  return {route,navigate};
}
