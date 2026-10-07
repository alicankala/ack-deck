import type { ChecklistItem } from "./productivity";
export function ChecklistEditor({ value = [], onChange, disabled = false }: {
    value?: ChecklistItem[];
    onChange: (value: ChecklistItem[]) => void;
    disabled?: boolean;
}) {
    function move(index: number, delta: number) { const next = [...value], other = index + delta; if (other < 0 || other >= next.length)
        return; [next[index], next[other]] = [next[other], next[index]]; onChange(next); }
    return <fieldset className="checklist-editor" disabled={disabled}><legend>Checklist {value.length > 0 && `· ${value.filter(v => v.completed).length}/${value.length}`}</legend>{value.map((row, index) => <div className="checklist-row" key={row.id}><input type="checkbox" aria-label={row.text + ": tamamlandı"} checked={row.completed} onChange={e => onChange(value.map(v => v.id === row.id ? { ...v, completed: e.target.checked } : v))}/><input aria-label={`Adım ${index + 1}`} value={row.text} maxLength={200} onChange={e => onChange(value.map(v => v.id === row.id ? { ...v, text: e.target.value } : v))} required/><button type="button" aria-label="Adımı yukarı taşı" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label="Adımı aşağı taşı" disabled={index === value.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label="Adımı kaldır" onClick={() => onChange(value.filter(v => v.id !== row.id))}>×</button></div>)}<button type="button" disabled={value.length >= 100} onClick={() => onChange([...value, { id: crypto.randomUUID(), text: "Yeni adım", completed: false }])}>+ Adım</button></fieldset>;
}
