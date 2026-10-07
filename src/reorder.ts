export function moveBefore<T extends {id:string}>(items:T[], id:string, target:string):T[] {
  const from=items.findIndex(item=>item.id===id), to=items.findIndex(item=>item.id===target);
  if(from<0||to<0||from===to)return items;
  const result=[...items], [item]=result.splice(from,1);
  result.splice(result.findIndex(row=>row.id===target),0,item);
  return result;
}
export function moveBy<T extends {id:string}>(items:T[], id:string, direction:number):T[] {
  const from=items.findIndex(item=>item.id===id), to=from+direction;
  if(from<0||to<0||to>=items.length)return items;
  const result=[...items]; [result[from],result[to]]=[result[to],result[from]];return result;
}
export function moveTo<T extends {id:string}>(items:T[], id:string, target:string):T[] {
  const from=items.findIndex(item=>item.id===id), to=items.findIndex(item=>item.id===target);
  if(from<0||to<0||from===to)return items;
  const result=[...items], [item]=result.splice(from,1);result.splice(to,0,item);return result;
}
