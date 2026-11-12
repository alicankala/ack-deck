import { useEffect, useState } from "react";
import { getAiQuotaUsage, type QuotaInfo } from "../aiQuotaStore";

export function AiQuotaMeter() {
  const [quota, setQuota] = useState<QuotaInfo>(getAiQuotaUsage);

  useEffect(() => {
    const updateQuota = () => setQuota(getAiQuotaUsage());
    window.addEventListener("ack-ai-quota-changed", updateQuota);
    return () => window.removeEventListener("ack-ai-quota-changed", updateQuota);
  }, []);

  return (
    <div
      className="ai-quota-meter"
      title={`Google Gemini ücretsiz günlük kullanım kotası (Google sunucularıyla senkron: Her gün 10:00'da yenilenir)\n⚡ Hızlı Model: ${quota.fastUsed} kullanıldı · ${quota.fastRemaining} kaldı (Limit: ${quota.fastLimit})\n🧠 Güçlü Model: ${quota.powerfulUsed} kullanıldı · ${quota.powerfulRemaining} kaldı (Limit: ${quota.powerfulLimit})`}
    >
      <span
        className={`ai-quota-pill ${quota.fastRemaining <= 100 ? "is-low" : ""}`}
        title={`Hızlı Model: ${quota.fastUsed} istek gönderildi, ${quota.fastRemaining} kaldı (Limit: ${quota.fastLimit})`}
      >
        ⚡ Hızlı: <strong>{quota.fastRemaining}</strong>/{quota.fastLimit}
        {quota.fastUsed > 0 && <small className="ai-quota-used-tag">({quota.fastUsed} gitti)</small>}
      </span>
      <span
        className={`ai-quota-pill ${quota.powerfulRemaining <= 5 ? "is-low" : ""}`}
        title={`Güçlü Model: ${quota.powerfulUsed} istek gönderildi, ${quota.powerfulRemaining} kaldı (Limit: ${quota.powerfulLimit})`}
      >
        🧠 Güçlü: <strong>{quota.powerfulRemaining}</strong>/{quota.powerfulLimit}
        {quota.powerfulUsed > 0 && <small className="ai-quota-used-tag">({quota.powerfulUsed} gitti)</small>}
      </span>
    </div>
  );
}
