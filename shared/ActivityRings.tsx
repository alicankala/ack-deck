import type { ActivityRingData } from "./activityOverview";

type ActivityRingsProps = {
  rings: {
    prayer: ActivityRingData;
    pomodoro: ActivityRingData;
    tasks: ActivityRingData;
  };
  size?: number;
  strokeWidth?: number;
  showCenterText?: boolean;
  centerScore?: number;
};

export function ActivityRings({
  rings,
  size = 140,
  strokeWidth,
  showCenterText = true,
  centerScore,
}: ActivityRingsProps) {
  // Compute ring dimensions based on size
  const actualStroke = strokeWidth ?? Math.max(4, Math.round(size * 0.085));
  const gap = Math.max(2, Math.round(actualStroke * 0.3));
  const center = size / 2;

  // Outer (Prayer): radius 1
  const r1 = center - actualStroke / 2 - 2;
  // Middle (Pomodoro): radius 2
  const r2 = r1 - actualStroke - gap;
  // Inner (Tasks): radius 3
  const r3 = r2 - actualStroke - gap;

  function renderRing(
    radius: number,
    ring: ActivityRingData,
    ringIndex: number
  ) {
    if (radius <= 0) return null;
    const circumference = 2 * Math.PI * radius;
    // Cap visual progress at 1 for clean circle, but if 0 render very tiny dot or 0
    const progress = Math.min(1, Math.max(0, ring.progress));
    const strokeDashoffset = circumference * (1 - progress);

    return (
      <g key={ring.label + ringIndex} className="activity-ring-group">
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ring.bgColor}
          strokeWidth={actualStroke}
          opacity={0.4}
        />
        {/* Progress Arc */}
        {progress > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ring.color}
            strokeWidth={actualStroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              filter: ring.progress >= 1 ? `drop-shadow(0 0 3px ${ring.color})` : undefined,
            }}
          />
        )}
      </g>
    );
  }

  const score = centerScore ?? Math.round(
    ((rings.prayer.progress + rings.pomodoro.progress + rings.tasks.progress) / 3) * 100
  );

  return (
    <div
      className="activity-rings-container"
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
        role="img"
        aria-label={`Aktivite Halkaları: Namaz %${Math.round(rings.prayer.progress * 100)}, Pomodoro %${Math.round(rings.pomodoro.progress * 100)}, Görevler %${Math.round(rings.tasks.progress * 100)}`}
      >
        {renderRing(r1, rings.prayer, 0)}
        {renderRing(r2, rings.pomodoro, 1)}
        {renderRing(r3, rings.tasks, 2)}
      </svg>
      {showCenterText && size >= 70 && (
        <div
          className="rings-center-label"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontSize: `${Math.round(size * 0.2)}px`,
              fontWeight: 800,
              lineHeight: 1,
              color: score >= 100 ? "#10b981" : "#f8fafc",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            %{score}
          </span>
          {score >= 100 && (
            <span
              style={{
                fontSize: `${Math.round(size * 0.1)}px`,
                marginTop: "2px",
                lineHeight: 1,
              }}
              title="Tüm hedefler tamamlandı!"
            >
              ⭐
            </span>
          )}
        </div>
      )}
    </div>
  );
}
