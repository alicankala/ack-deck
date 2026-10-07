import { ProjectHub } from "./ProjectHub";
import type { NavigationTarget } from "../navigation";
import { moveTo, moveBy } from "../reorder";
import { EditorDialog } from "./EditorDialog";
import { ActionMenu } from "./ActionMenu";
import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { Project } from "../projectStore";
import { Icon } from "./Icon";
import { recordRecent } from "../recentStore";
import { Workspaces } from "./Workspaces";

type Editor = { id: string | null; name: string; description: string; folderPath: string };
type Props = { projects: Project[]; onChange: (projects: Project[]) => boolean; fullPage?: boolean; initialId?: string; workspaceId?: string; onNavigate?: (target: NavigationTarget)=>void; onAskAi?: (text:string)=>void };
const emptyEditor: Editor = { id: null, name: "", description: "", folderPath: "" };
const safeErrors = new Set(["Klasör bulunamadı.", "Klasör açılamadı.", "VS Code bulunamadı veya açılamadı."]);

export function Projects({ projects, onChange, fullPage = false, initialId, workspaceId, onNavigate, onAskAi }: Props) {
  useEffect(() => { if (initialId) document.getElementById("project-" + initialId)?.scrollIntoView({ block: "center" }); }, [initialId]);
  const [hubId,setHubId]=useState(initialId??"");
  useEffect(()=>{if(hubId)document.getElementById("project-work-summary")?.scrollIntoView({block:"start",behavior:"smooth"});},[hubId]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dragged,setDragged]=useState<string|null>(null),[dragOver,setDragOver]=useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function startEdit(project?: Project) {
    setMessage("");
    setDeleteId(null);
    setEditor(project ? { ...project } : { ...emptyEditor });
  }

  async function chooseFolder() {
    if (!editor) return;
    setBusy(true);
    setMessage("");
    try {
      const picked = await invoke<{target:string} | null>("choose_launch_target", {kind:"folder"});
      const chosen = picked?.target;
      if (typeof chosen === "string") setEditor((current) => current ? { ...current, folderPath: chosen } : current);
    } catch {
      setMessage("Klasör seçme penceresi açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) return;
    const project: Project = {
      ...(editor.id ? projects.find(p=>p.id===editor.id) : {}), id: editor.id ?? crypto.randomUUID(), name,
      description: editor.description.trim(), folderPath: editor.folderPath,
    };
    if (!onChange(editor.id
      ? projects.map((item) => item.id === editor.id ? project : item)
      : [...projects, project])) return;
    setEditor(null);
    setMessage("");
  }

  async function launch(project: Project, command: "open_project_folder" | "open_project_in_vscode") {
    if (!project.folderPath || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await invoke(command, { path: project.folderPath });
      recordRecent("projects", project.id, command === "open_project_in_vscode" ? "vscode" : "folder");
    } catch (error) {
      setMessage(typeof error === "string" && safeErrors.has(error) ? error : "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    if (!onChange(projects.filter((project) => project.id !== id))) return;
    setDeleteId(null);
    setMessage("");
  }

  return <section className={fullPage ? "projects-page" : "section projects-section"} aria-labelledby="projects-heading">
    {fullPage ? <header className="feature-heading"><h1 id="projects-heading">Projeler</h1><p>Projelerin, görevlerin ve notların aynı yerde.</p></header> :
      <div className="section-heading"><div><span className="eyebrow">ÜZERİNDE ÇALIŞTIKLARIN</span><h2 id="projects-heading">Projeler</h2></div><span className="section-meta">{projects.length} PROJE</span></div>}
    {message && <div className="project-feedback" role="alert">{message}</div>}
    {editor && <EditorDialog title={editor.id ? "Projeyi düzenle" : "Yeni proje"} onClose={() => setEditor(null)} busy={busy} error={message}><form className="project-editor surface" onSubmit={save} onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); setEditor(null); } }}>

      <label htmlFor="project-name">Proje adı</label>
      <input id="project-name" autoFocus value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} maxLength={80} required />
      <label htmlFor="project-description">Kısa açıklama</label>
      <textarea id="project-description" value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} maxLength={240} rows={2} />
      <label htmlFor="project-folder">Yerel klasör</label>
      <div className="project-folder-row"><input id="project-folder" value={editor.folderPath} placeholder="Klasör seçilmedi" readOnly /><button className="button button-secondary" type="button" onClick={chooseFolder} disabled={busy}>Klasör Seç</button>{editor.folderPath && <button className="button button-secondary" type="button" onClick={() => setEditor({ ...editor, folderPath: "" })}>Kaldır</button>}</div>
      <div className="project-editor-actions"><button className="button button-primary" type="submit" disabled={!editor.name.trim() || busy}>Kaydet</button><button className="button button-secondary" type="button" onClick={() => setEditor(null)}>Vazgeç</button></div>
    </form></EditorDialog>}
    {projects.length>1&&<p className="project-reorder-hint">Kartları sürükleyerek sırala. İşlemler menüsünden de taşıyabilirsin.</p>}<div className="project-grid">
      {projects.map((project, index) => <article draggable={!busy} onDragStart={event=>{setDragged(project.id);event.dataTransfer.setData("text/plain",project.id);event.dataTransfer.effectAllowed="move";}} onDragOver={event=>{if(dragged){event.preventDefault();setDragOver(project.id);}}} onDrop={event=>{event.preventDefault();if(dragged)onChange(moveTo(projects,dragged,project.id));setDragged(null);setDragOver(null);}} onDragEnd={()=>{setDragged(null);setDragOver(null);}} id={"project-" + project.id} className={"project-card surface " + (initialId === project.id ? "record-highlight " : "")+(dragged===project.id?"dragging ":"")+(dragOver===project.id?"drag-over":"")} key={project.id}>
        <div className="project-top"><span className="project-avatar">{project.name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "P"}</span><span className="project-number">{String(index + 1).padStart(2, "0")} / {String(projects.length).padStart(2, "0")}</span></div>
        <div className="project-info"><h3><button className="project-hub-open" onClick={()=>setHubId(hubId===project.id?"":project.id)}>{project.name}</button></h3>{project.nextStep&&<p className="project-next-step">→ {project.nextStep}</p>}<p>{project.description || "Açıklama yok"}</p><span className="project-path" title={project.folderPath}>{project.folderPath || "Klasör bağlanmadı"}</span></div>
        <div className="project-actions"><button type="button" aria-label={project.name + " klasörünü aç"} onClick={() => launch(project, "open_project_folder")} disabled={!project.folderPath || busy}>Klasörü Aç</button><button type="button" aria-label={project.name + " projesini VS Code'da aç"} onClick={() => launch(project, "open_project_in_vscode")} disabled={!project.folderPath || busy}>VS Code'da Aç</button><ActionMenu label={project.name+" işlemleri"}><button type="button" disabled={index===0||busy} onClick={()=>onChange(moveBy(projects,project.id,-1))}>Öne taşı</button><button type="button" disabled={index===projects.length-1||busy} onClick={()=>onChange(moveBy(projects,project.id,1))}>Arkaya taşı</button><button type="button" aria-label={project.name + " projesini düzenle"} onClick={() => startEdit(project)}>Düzenle</button><button className="project-delete" type="button" aria-label={project.name + " projesini sil"} onClick={() => setDeleteId(project.id)}>Sil</button></ActionMenu></div>
        {deleteId === project.id && <div className="project-confirm"><span>Bu proje silinsin mi?</span><button type="button" aria-label={project.name + " projesini silmeyi onayla"} onClick={() => remove(project.id)}>Evet, sil</button><button type="button" onClick={() => setDeleteId(null)}>Vazgeç</button></div>}
      </article>)}
      <button className="project-add" type="button" onClick={() => startEdit()}><span className="add-icon"><Icon name="plus" size={22} /></span><strong>+ Proje</strong><span>Yeni bir proje ekle</span></button>
    </div>
    {fullPage && hubId && projects.find(p=>p.id===hubId) && <ProjectHub key={hubId} project={projects.find(p=>p.id===hubId)!} onChange={patch=>onChange(projects.map(p=>p.id===hubId?{...p,...patch}:p))} onNavigate={onNavigate} onAskAi={onAskAi}/> }
    {fullPage && <Workspaces embedded initialId={workspaceId} />}
  </section>;
}
