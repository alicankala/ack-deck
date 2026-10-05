import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon, type IconName } from "./Icon";

export type PcSnapshot = {
  cpuPercent: number | null;
  ramUsedBytes: number | null;
  ramTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  networkConnected: boolean;
};
type PcMetric = { label: string; value: string; detail: string; percentage: number | null; icon: IconName };

function gigabytes(bytes: number): string {
  return (bytes / 1024 ** 3).toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + " GB";
}

function percentage(used: number | null, total: number | null): number | null {
  return used !== null && total !== null && total > 0 ? Math.min(100, Math.max(0, used / total * 100)) : null;
}

export function PcStatus({ refreshMs = 2500, compact = false }: { refreshMs?: number; compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<PcSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await invoke<PcSnapshot>("pc_status");
        if (active) { setSnapshot(next); setFailed(false); }
      } catch {
        if (active) { setSnapshot(null); setFailed(true); }
      } finally {
        inFlight = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, refreshMs);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshMs]);

  const ramPercent = percentage(snapshot?.ramUsedBytes ?? null, snapshot?.ramTotalBytes ?? null);
  const diskPercent = percentage(snapshot?.diskUsedBytes ?? null, snapshot?.diskTotalBytes ?? null);
  const metrics: PcMetric[] = [
    { label: "CPU", value: snapshot?.cpuPercent == null ? "--" : "%" + Math.round(snapshot.cpuPercent), detail: "Toplam kullanım", percentage: snapshot?.cpuPercent ?? null, icon: "cpu" },
    { label: "RAM", value: snapshot?.ramUsedBytes != null && snapshot.ramTotalBytes != null ? gigabytes(snapshot.ramUsedBytes) + " / " + gigabytes(snapshot.ramTotalBytes) : "--", detail: ramPercent === null ? "Alınamadı" : "%" + Math.round(ramPercent) + " kullanım", percentage: ramPercent, icon: "memory" },
    { label: "Disk", value: snapshot?.diskUsedBytes != null && snapshot.diskTotalBytes != null ? gigabytes(snapshot.diskUsedBytes) + " / " + gigabytes(snapshot.diskTotalBytes) : "--", detail: diskPercent === null || snapshot?.diskFreeBytes == null ? "Alınamadı" : "%" + Math.round(diskPercent) + " kullanım · Boş " + gigabytes(snapshot.diskFreeBytes), percentage: diskPercent, icon: "drive" },
  ];

  const card = <div className="pc-card surface">
    <div className="metric-grid">{metrics.map((metric) => <div className="metric" key={metric.label}><div className="metric-icon"><Icon name={metric.icon} size={19} /></div><div className="metric-label">{metric.label}</div><div className="metric-value">{metric.value}</div><div className="metric-track" role="meter" aria-label={metric.label + " kullanımı"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={metric.percentage === null ? undefined : Math.round(metric.percentage)} aria-valuetext={metric.percentage === null ? "Alınamadı" : undefined}><div style={{ width: (metric.percentage ?? 0) + "%" }} /></div><div className="metric-detail">{metric.detail}</div></div>)}</div>
    <div className="network-row"><div className="network-icon"><Icon name="wifi" size={18} /></div><div><strong>Ağ bağlantısı</strong><span>Windows bağlantı durumu</span></div><span className={"network-pill " + (snapshot && !snapshot.networkConnected ? "offline" : !snapshot ? "unknown" : "")}><span /> {!snapshot ? "Alınamadı" : snapshot.networkConnected ? "Bağlı" : "Bağlantı Yok"}</span></div>
  </div>;
  if (compact) return <details className="dashboard-pc" aria-label="PC Durumu"><summary><span className="dashboard-pc-title"><Icon name="cpu" size={15} /> PC Durumu</span><span>CPU {snapshot?.cpuPercent == null ? "--" : "%" + Math.round(snapshot.cpuPercent)}</span><span>RAM {ramPercent === null ? "--" : "%" + Math.round(ramPercent)}</span><span>Disk {diskPercent === null ? "--" : "%" + Math.round(diskPercent)}</span><span className={snapshot?.networkConnected ? "connected" : ""}><span className="dashboard-network-dot" />{!snapshot ? failed ? "Alınamadı" : "Yükleniyor" : snapshot.networkConnected ? "İnternet bağlı" : "Bağlantı yok"}</span><small>Ayrıntılar</small></summary>{card}</details>;
  return <section className="section pc-section" aria-labelledby="pc-heading"><div className="section-heading"><div><span className="eyebrow">SİSTEM ÖZETİ</span><h2 id="pc-heading">PC Durumu</h2></div><span className="section-meta"><span className="live-dot" /> {failed ? "Alınamadı" : snapshot ? "Güncel" : "Yükleniyor"}</span></div>{card}</section>;
}
