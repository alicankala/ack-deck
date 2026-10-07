import { loadProjectSnapshot } from "../projectStore";
import { loadWorkspaces } from "../workHubStore";
import type { RecordLinks } from "../../shared/productivity";
export function RecordLinkFields({ value, onChange, workspace = true, project = true }: {
    value: RecordLinks;
    onChange: (patch: RecordLinks) => void;
    workspace?: boolean;
    project?: boolean;
}) {
    const projects = loadProjectSnapshot(), spaces = loadWorkspaces();
    return <div className="archive-form-grid record-links">{project && <label>Proje<select value={value.projectId ?? ""} disabled={projects.locked} onChange={e => onChange({ projectId: e.target.value || null })}><option value="">Projesiz</option>{value.projectId && !projects.entries.some(p => p.id === value.projectId) && <option value={value.projectId}>Bağlı proje bulunamadı</option>}{projects.entries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{workspace && <label>Çalışma alanı<select value={value.workspaceId ?? ""} disabled={spaces.locked} onChange={e => onChange({ workspaceId: e.target.value || null })}><option value="">Bağlanmadı</option>{value.workspaceId && !spaces.entries.some(p => p.id === value.workspaceId) && <option value={value.workspaceId}>Bağlı çalışma alanı bulunamadı</option>}{spaces.entries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}</div>;
}
