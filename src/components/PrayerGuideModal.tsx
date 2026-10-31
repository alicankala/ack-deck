import { useState, useId, useEffect } from "react";
import {
  PRAYER_GUIDE_ITEMS,
  KAMET_INFO,
  TESBIHAT_INFO,
  ZAMMI_SURELER,
  NAMAZ_DUALARI,
  type SurahOrDua,
} from "../../shared/prayerGuideData";

type TabKind = "rakats" | "kamet_tesbihat" | "surahs" | "duas";

export function PrayerGuideModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<TabKind>("rakats");
  const [search, setSearch] = useState("");
  const [selectedPrayerId, setSelectedPrayerId] = useState<string>("fajr");
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({
    fatiha: true,
    fil: true,
    subhaneke: true,
    kunut_1: true,
  });

  const titleId = useId();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleExpand = (id: string) => {
    setExpandedItemIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const q = search.trim().toLowerCase();

  // Search filter
  const matchedSurahs = ZAMMI_SURELER.filter(
    (s) =>
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.turkishReading.toLowerCase().includes(q) ||
      s.turkishMeaning.toLowerCase().includes(q)
  );

  const matchedDuas = NAMAZ_DUALARI.filter(
    (d) =>
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.turkishReading.toLowerCase().includes(q) ||
      d.turkishMeaning.toLowerCase().includes(q)
  );

  const matchedPrayers = PRAYER_GUIDE_ITEMS.filter(
    (p) =>
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.stepByStep.some((s) => s.toLowerCase().includes(q))
  );

  const isSearchActive = Boolean(q);

  return (
    <div
      className="prayer-guide-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="prayer-guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="prayer-guide-header">
          <div className="prayer-guide-title-box">
            <span className="prayer-guide-icon" aria-hidden="true">
              🕌
            </span>
            <div>
              <h2 id={titleId} className="prayer-guide-title">
                Namaz Kılavuzu & Rehberi
              </h2>
              <p className="prayer-guide-subtitle">
                Kamet, Âyet-el Kürsî, sünnet/farz rekatları ve zamm-ı sureler
              </p>
            </div>
          </div>
          <button
            type="button"
            className="prayer-guide-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="prayer-guide-search-wrap">
          <span className="prayer-guide-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sure, dua, kamet veya namaz ara (örn. Ayetel Kürsi, Kamet, İkindi, Kevser)..."
            className="prayer-guide-search-input"
          />
          {search && (
            <button
              type="button"
              className="prayer-guide-search-clear"
              onClick={() => setSearch("")}
              aria-label="Aramayı temizle"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        {!isSearchActive && (
          <div className="prayer-guide-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "rakats"}
              className={`prayer-tab-btn ${activeTab === "rakats" ? "is-active" : ""}`}
              onClick={() => setActiveTab("rakats")}
            >
              🕋 Rekatlar & Kılınış
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "kamet_tesbihat"}
              className={`prayer-tab-btn ${activeTab === "kamet_tesbihat" ? "is-active" : ""}`}
              onClick={() => setActiveTab("kamet_tesbihat")}
            >
              📢 Kamet & Âyet-el Kürsî
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "surahs"}
              className={`prayer-tab-btn ${activeTab === "surahs" ? "is-active" : ""}`}
              onClick={() => setActiveTab("surahs")}
            >
              📖 Zamm-ı Sureler ({ZAMMI_SURELER.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "duas"}
              className={`prayer-tab-btn ${activeTab === "duas" ? "is-active" : ""}`}
              onClick={() => setActiveTab("duas")}
            >
              🤲 Namaz Duaları ({NAMAZ_DUALARI.length})
            </button>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="prayer-guide-content">
          {/* SEARCH RESULTS VIEW */}
          {isSearchActive ? (
            <div className="prayer-guide-search-results">
              <div className="search-results-info">
                "{search}" için bulunan sonuçlar:
              </div>

              {/* Matched Prayers */}
              {matchedPrayers.length > 0 && (
                <div className="search-group">
                  <h4 className="search-group-title">🕌 Namazlar</h4>
                  {matchedPrayers.map((item) => (
                    <div key={item.id} className="prayer-card-summary">
                      <div className="prayer-card-header">
                        <strong>{item.title}</strong>
                        <span className="rakat-badge">{item.totalRakats} Rekat</span>
                      </div>
                      <p className="prayer-card-desc">{item.description}</p>
                      <div className="prayer-sections-pills">
                        {item.sections.map((sec, idx) => (
                          <span
                            key={idx}
                            className={`section-pill is-${sec.type} ${sec.hasKametBefore ? "has-kamet" : ""}`}
                          >
                            {sec.hasKametBefore && "🔔 Kamet ➔ "}
                            {sec.name} ({sec.typeLabel})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Matched Kamet or Tesbihat mention */}
              {(q.includes("kamet") || q.includes("ayet") || q.includes("tesbih")) && (
                <div className="search-group">
                  <h4 className="search-group-title">📢 Kamet & Tesbihat</h4>
                  <div className="kamet-box highlight-card">
                    <strong>{KAMET_INFO.title}</strong>
                    <p>{KAMET_INFO.rule}</p>
                    <pre className="prayer-reading-box">{KAMET_INFO.turkishReading}</pre>
                  </div>
                  <div className="tesbihat-box highlight-card" style={{ marginTop: "8px" }}>
                    <strong>{TESBIHAT_INFO.title}</strong>
                    <p>{TESBIHAT_INFO.rule}</p>
                    <div className="tesbihat-step-item">
                      <strong>✨ Âyet-el Kürsî (Bakara 255)</strong>
                      <p>Tesbihten hemen önce okunur.</p>
                      <pre className="prayer-reading-box">
                        {TESBIHAT_INFO.steps.find((s) => s.isAyatelKursi)?.turkishReading}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Matched Surahs */}
              {matchedSurahs.length > 0 && (
                <div className="search-group">
                  <h4 className="search-group-title">📖 Zamm-ı Sureler</h4>
                  {matchedSurahs.map((surah) => (
                    <SurahOrDuaCard
                      key={surah.id}
                      item={surah}
                      expanded={expandedItemIds[surah.id] ?? true}
                      onToggle={() => toggleExpand(surah.id)}
                    />
                  ))}
                </div>
              )}

              {/* Matched Duas */}
              {matchedDuas.length > 0 && (
                <div className="search-group">
                  <h4 className="search-group-title">🤲 Dualar</h4>
                  {matchedDuas.map((dua) => (
                    <SurahOrDuaCard
                      key={dua.id}
                      item={dua}
                      expanded={expandedItemIds[dua.id] ?? true}
                      onToggle={() => toggleExpand(dua.id)}
                    />
                  ))}
                </div>
              )}

              {matchedPrayers.length === 0 &&
                matchedSurahs.length === 0 &&
                matchedDuas.length === 0 && (
                  <div className="prayer-empty-search">
                    <p>Aramanızla eşleşen sure, dua veya namaz bulunamadı.</p>
                  </div>
                )}
            </div>
          ) : (
            <>
              {/* TAB 1: RAKATS & STEP-BY-STEP */}
              {activeTab === "rakats" && (
                <div className="tab-pane-rakats">
                  {/* Important Rule Banner */}
                  <div className="prayer-rule-banner">
                    <span className="banner-icon" aria-hidden="true">💡</span>
                    <div>
                      <strong>Farz ile Sünnet Arasındaki Temel Farklar:</strong>
                      <p>
                        • <strong>Zamm-ı Sure Kuralı:</strong> Sünnet namazlarda ve vitirde <u>her rekatta</u> Fatiha'dan sonra zamm-ı sure okunur.
                        Farz namazlarda (öğle, ikindi, akşam, yatsı farzları) ise zamm-ı sure <u>yalnızca ilk 2 rekatta</u> okunur; 3. ve 4. rekatlarda <strong>sadece Fatiha</strong> okunur.<br />
                        • <strong>Kamet:</strong> Yalnızca <strong>Farz</strong> namazlara başlamadan hemen önce erkekler tarafından okunur.
                      </p>
                    </div>
                  </div>

                  {/* Prayer Selection Buttons */}
                  <div className="prayer-choice-bar">
                    {PRAYER_GUIDE_ITEMS.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`prayer-choice-pill ${selectedPrayerId === item.id ? "is-selected" : ""}`}
                        onClick={() => setSelectedPrayerId(item.id)}
                      >
                        <strong>{item.title}</strong>
                        <small>{item.totalRakats} Rekat</small>
                      </button>
                    ))}
                  </div>

                  {/* Selected Prayer Detail */}
                  {(() => {
                    const current =
                      PRAYER_GUIDE_ITEMS.find((p) => p.id === selectedPrayerId) ||
                      PRAYER_GUIDE_ITEMS[0];
                    return (
                      <div className="selected-prayer-card">
                        <div className="selected-prayer-head">
                          <div>
                            <h3 className="selected-prayer-title">
                              {current.title}{" "}
                              <span className="total-rakat-tag">
                                Toplam {current.totalRakats} Rekat
                              </span>
                            </h3>
                            <span className="selected-prayer-time">
                              🕒 Vakti: {current.timeLabel}
                            </span>
                          </div>
                        </div>

                        <p className="selected-prayer-desc">{current.description}</p>

                        {/* Section Breakdown (Sunnah / Fard / Kamet) */}
                        <div className="prayer-breakdown-list">
                          <h4 className="sub-heading">Kılınış Sırası ve Bölümler:</h4>
                          {current.sections.map((sec, idx) => (
                            <div
                              key={idx}
                              className={`prayer-section-row is-${sec.type} ${sec.hasKametBefore ? "with-kamet-badge" : ""}`}
                            >
                              <div className="section-main-info">
                                <span className={`type-badge is-${sec.type}`}>
                                  {sec.typeLabel}
                                </span>
                                <strong>{sec.name}</strong>
                              </div>
                              {sec.hasKametBefore && (
                                <div className="kamet-alert-inline">
                                  🔔 <strong>Farz Öncesi Kamet Getirilir</strong> (Erkekler için)
                                </div>
                              )}
                              {sec.notes && <p className="section-note">{sec.notes}</p>}
                            </div>
                          ))}
                        </div>

                        {/* Step By Step Guide */}
                        <div className="prayer-steps-box">
                          <h4 className="sub-heading">Adım Adım Kılınış Rehberi:</h4>
                          <ol className="steps-ordered-list">
                            {current.stepByStep.map((step, idx) => (
                              <li
                                key={idx}
                                className={step.includes("KAMET") ? "step-highlight-kamet" : ""}
                              >
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: KAMET & TESBIHAT & AYETEL KURSI */}
              {activeTab === "kamet_tesbihat" && (
                <div className="tab-pane-kamet">
                  {/* KAMET SECTION */}
                  <div className="guide-card kamet-card">
                    <div className="guide-card-header">
                      <span className="guide-card-icon">🔔</span>
                      <div>
                        <h3>{KAMET_INFO.title}</h3>
                        <span className="guide-card-badge">Farz Öncesi</span>
                      </div>
                    </div>

                    <div className="guide-rule-box">
                      <strong>Hükmü ve Zamanı:</strong>
                      <p>{KAMET_INFO.rule}</p>
                      <p className="timing-hint">⏰ <strong>Ne Zaman?:</strong> {KAMET_INFO.timing}</p>
                    </div>

                    <div className="dual-reading-grid">
                      <div className="text-column">
                        <span className="column-label">Türkçe Okunuşu:</span>
                        <pre className="reading-text">{KAMET_INFO.turkishReading}</pre>
                      </div>
                      <div className="text-column meaning-col">
                        <span className="column-label">Türkçe Anlamı (Meali):</span>
                        <pre className="meaning-text">{KAMET_INFO.turkishMeaning}</pre>
                      </div>
                    </div>
                  </div>

                  {/* TESBIHAT & AYETEL KURSI SECTION */}
                  <div className="guide-card tesbihat-card" style={{ marginTop: "16px" }}>
                    <div className="guide-card-header">
                      <span className="guide-card-icon">📿</span>
                      <div>
                        <h3>{TESBIHAT_INFO.title}</h3>
                        <span className="guide-card-badge">Namaz Tamamlanınca</span>
                      </div>
                    </div>

                    <p className="guide-card-desc">{TESBIHAT_INFO.rule}</p>

                    <div className="tesbihat-steps-list">
                      {TESBIHAT_INFO.steps.map((st, idx) => (
                        <div
                          key={idx}
                          className={`tesbihat-step-card ${st.isAyatelKursi ? "is-ayatel-kursi" : ""}`}
                        >
                          <div className="step-card-top">
                            <strong className="step-card-title">{st.title}</strong>
                            <small className="step-card-timing">{st.timing}</small>
                          </div>

                          {st.isAyatelKursi && (
                            <div className="ayatel-kursi-badge">
                              ✨ <strong>Âyet-el Kürsî (Bakara Suresi 255. Ayet)</strong>
                              <p>
                                Peygamber Efendimiz (s.a.v.) buyurmuştur: <em>"Her farz namazın ardından Âyet-el Kürsî'yi okuyan kimsenin cennete girmesine ancak ölüm engel olur."</em>
                              </p>
                            </div>
                          )}

                          {st.arabic && (
                            <div className="arabic-text" dir="rtl">
                              {st.arabic}
                            </div>
                          )}

                          <div className="dual-reading-grid">
                            <div className="text-column">
                              <span className="column-label">Türkçe Okunuşu:</span>
                              <pre className="reading-text">{st.turkishReading}</pre>
                            </div>
                            <div className="text-column meaning-col">
                              <span className="column-label">Türkçe Anlamı:</span>
                              <pre className="meaning-text">{st.turkishMeaning}</pre>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: ZAMM-I SURELER */}
              {activeTab === "surahs" && (
                <div className="tab-pane-surahs">
                  <div className="prayer-rule-banner">
                    <span className="banner-icon" aria-hidden="true">📖</span>
                    <div>
                      <strong>Zamm-ı Sure Kuralları:</strong>
                      <p>
                        • Fatiha suresinden sonra Kur'an-ı Kerim'den en az 3 kısa ayet veya 1 uzun ayet okumak vaciptir.<br />
                        • Rekatlarda sure okurken Mushaf tertibine (sırasına) dikkat etmek sünnettir (örneğin 1. rekatta Fil, 2. rekatta Kureyş veya Kevser).
                      </p>
                    </div>
                  </div>

                  <div className="surahs-list">
                    {ZAMMI_SURELER.map((surah) => (
                      <SurahOrDuaCard
                        key={surah.id}
                        item={surah}
                        expanded={expandedItemIds[surah.id] ?? false}
                        onToggle={() => toggleExpand(surah.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: NAMAZ DUALARI */}
              {activeTab === "duas" && (
                <div className="tab-pane-duas">
                  <div className="prayer-rule-banner">
                    <span className="banner-icon" aria-hidden="true">🤲</span>
                    <div>
                      <strong>Namazda Okunan Temel Dualar:</strong>
                      <p>
                        Sübhaneke (başlangıçta), Ettehiyyâtü (tüm oturuşlarda), Allâhümme Salli-Bârik ve Rabbenâ duaları (son oturuşta), Kunut duaları ise vitir namazının 3. rekatında okunur.
                      </p>
                    </div>
                  </div>

                  <div className="duas-list">
                    {NAMAZ_DUALARI.map((dua) => (
                      <SurahOrDuaCard
                        key={dua.id}
                        item={dua}
                        expanded={expandedItemIds[dua.id] ?? false}
                        onToggle={() => toggleExpand(dua.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SurahOrDuaCard({
  item,
  expanded,
  onToggle,
}: {
  item: SurahOrDua;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={`surah-card ${expanded ? "is-expanded" : ""}`}>
      <button
        type="button"
        className="surah-card-summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="surah-title-meta">
          <span className="surah-badge">{item.categoryLabel}</span>
          <strong>{item.title}</strong>
        </div>
        <div className="surah-toggle-actions">
          <small className="when-read-hint">{item.whenRead}</small>
          <span className="expand-chevron" aria-hidden="true">
            {expanded ? "▴" : "▾"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="surah-card-details">
          {item.arabic && (
            <div className="arabic-text" dir="rtl">
              {item.arabic}
            </div>
          )}

          <div className="dual-reading-grid">
            <div className="text-column">
              <span className="column-label">Türkçe Okunuşu:</span>
              <pre className="reading-text">{item.turkishReading}</pre>
            </div>
            <div className="text-column meaning-col">
              <span className="column-label">Türkçe Anlamı:</span>
              <pre className="meaning-text">{item.turkishMeaning}</pre>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
