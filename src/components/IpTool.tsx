import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type LocalIpInfo = { localIpv4: string | null; adapterName: string | null; gateway: string | null; internetConnected: boolean };

export function IpTool() {
  const [local, setLocal] = useState<LocalIpInfo | null>(null);
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    invoke<LocalIpInfo>("local_ip_info").then((value) => { if (active) setLocal(value); }).catch(() => { if (active) setLocal(null); }).finally(() => { if (active) setLocalLoading(false); });
    invoke<string | null>("public_ip_info").then((value) => { if (active) setPublicIp(value); }).catch(() => { if (active) setPublicIp(null); }).finally(() => { if (active) setPublicLoading(false); });
    return () => { active = false; };
  }, [revision]);

  function refresh() {
    setLocalLoading(true);
    setPublicLoading(true);
    setRevision((value) => value + 1);
  }

  const value = (entry: string | null | undefined, loading: boolean) => loading ? "Yükleniyor..." : entry || "Alınamadı";
  return <div className="ip-page">
    <header className="feature-heading ip-heading"><div><h1>IP Bilgisi</h1><p>Bu bilgisayarın ağ bilgileri.</p></div><button className="button button-secondary" type="button" onClick={refresh} disabled={localLoading || publicLoading}>Yenile</button></header>
    <div className="ip-grid">
      <section className="ip-card surface"><h2>Yerel Ağ</h2><dl>
        <div><dt>Yerel IPv4</dt><dd>{value(local?.localIpv4, localLoading)}</dd></div>
        <div><dt>Aktif adaptör</dt><dd>{value(local?.adapterName, localLoading)}</dd></div>
        <div><dt>Varsayılan ağ geçidi</dt><dd>{value(local?.gateway, localLoading)}</dd></div>
        <div><dt>İnternet durumu</dt><dd>{localLoading ? "Yükleniyor..." : local ? (local.internetConnected ? "Bağlı" : "Bağlantı Yok") : "Alınamadı"}</dd></div>
      </dl></section>
      <section className="ip-card surface"><h2>Genel IP</h2><strong className="ip-public-value">{value(publicIp, publicLoading)}</strong><p>Genel IP adresi internet üzerinden ipify servisine istek yapılarak alınır. İstek yalnızca bu sayfa açıldığında veya Yenile'ye bastığında gönderilir.</p></section>
    </div>
  </div>;
}
