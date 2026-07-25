// Semicircular gauge (pure SVG, server-renderable).
export function Gauge({
  value,
  label,
  sublabel,
}: {
  value: number; // 0..100
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 80;
  const cx = 100;
  const cy = 100;
  const circumference = Math.PI * r; // semicircle length
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative mx-auto w-full max-w-[220px]">
      <svg viewBox="0 0 200 110" className="w-full">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#eceef0"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c1de78" />
            <stop offset="100%" stopColor="#74a02e" />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-3xl font-bold tracking-tight">
          {Math.round(pct)}%
        </span>
        {label && <span className="text-xs text-ink-muted">{label}</span>}
      </div>
      {sublabel && (
        <p className="mt-3 text-center text-xs text-ink-muted">{sublabel}</p>
      )}
    </div>
  );
}
