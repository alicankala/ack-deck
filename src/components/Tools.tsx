import { Icon, type IconName } from "./Icon";
import type { Page } from "./Sidebar";

const tools: { label: string; subtitle: string; icon: IconName; page: Page }[] = [
  { label: "QR", subtitle: "Kod oluştur", icon: "qr", page: "qr" },
  { label: "IP", subtitle: "Ağ bilgisi", icon: "globe", page: "ip" },
  { label: "Hız Testi", subtitle: "Bağlantını ölç", icon: "speed", page: "speed" },
  { label: "PC Durumu", subtitle: "Gerçek sistem bilgileri", icon: "grid", page: "pc" },
  { label: "Arşiv", subtitle: "Önemli kayıtların", icon: "archive", page: "archive" },
];

export function Tools({ onOpen, fullPage = false }: { onOpen: (page: Page) => void; fullPage?: boolean }) {
  return <section className={"section tools-section " + (fullPage ? "tools-page" : "")} aria-labelledby="tools-heading">
    <div className={fullPage ? "feature-heading" : "section-heading"}><div>{!fullPage && <span className="eyebrow">ELİNİN ALTINDA</span>}{fullPage ? <h1 id="tools-heading">Araçlar</h1> : <h2 id="tools-heading">Hızlı Araçlar</h2>}</div></div>
    <div className="tool-grid">{tools.map((tool) => <button className="tool-card surface" key={tool.label} type="button" onClick={() => onOpen(tool.page)}><span className="tool-icon"><Icon name={tool.icon} size={21} /></span><span className="tool-copy"><strong>{tool.label}</strong><small>{tool.subtitle}</small></span><Icon name="arrowRight" size={15} className="tool-arrow" /></button>)}</div>
  </section>;
}
