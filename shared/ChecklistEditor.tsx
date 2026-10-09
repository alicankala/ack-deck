import type { ChecklistItem } from "./productivity";
import { ActionMenu } from "../src/components/ActionMenu";
export function ChecklistEditor({ value = [], onChange, disabled = false }: {
    value?: ChecklistItem[];
    onChange: (value: ChecklistItem[]) => void;
    disabled?: boolean;
}) {
    function move(index: number, delta: number) { const next = [...value], other = index + delta; if (other < 0 || other >= next.length)
        return; [next[index], next[other]] = [next[other], next[index]]; onChange(next); }
    return <fieldset className="checklist-editor" disabled={disabled}><legend>Adımlar {value.length > 0 && `· ${value.filter(v => v.completed).length}/${value.length}`}</legend>{value.map((row, index) => <div className="checklist-row" key={row.id}><input type="checkbox" aria-label={row.text + ": tamamlandı"} checked={row.completed} onChange={e => onChange(value.map(v => v.id === row.id ? { ...v, completed: e.target.checked } : v))}/><input aria-label={`Adım ${index + 1}`} value={row.text} maxLength={200} onChange={e => onChange(value.map(v => v.id === row.id ? { ...v, text: e.target.value } : v))} required/><ActionMenu label={`Adım ${index + 1} işlemleri`}><button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}>Yukarı taşı</button><button type="button" disabled={disabled || index === value.length - 1} onClick={() => move(index, 1)}>Aşağı taşı</button><button type="button" className="danger-action" disabled={disabled} onClick={() => onChange(value.filter(v => v.id !== row.id))}>Adımı kaldır</button></ActionMenu></div>)}<button type="button" disabled={value.length >= 100} onClick={() => onChange([...value, { id: crypto.randomUUID(), text: "Yeni adım", completed: false }])}>+ Adım</button></fieldset>;
}
