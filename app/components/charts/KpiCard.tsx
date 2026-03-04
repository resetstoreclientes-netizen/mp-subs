interface KpiCardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  currentValue?: number;
  format?: "number" | "currency" | "percent";
  invertTrend?: boolean;
  accent: "green" | "blue" | "purple" | "amber";
  icon: "revenue" | "users" | "new" | "churn" | "arpu" | "calendar" | "clock" | "lifetime";
  subtitle?: string;
}

function formatValue(value: string | number, format: string): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return `$${value.toLocaleString("es-AR")}`;
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return value.toLocaleString("es-AR");
  }
}

const ICONS: Record<string, JSX.Element> = {
  revenue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  new: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  churn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  arpu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  lifetime: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
};

export function KpiCard({
  title,
  value,
  previousValue,
  currentValue,
  format = "number",
  invertTrend = false,
  accent,
  icon,
  subtitle,
}: KpiCardProps) {
  let changePercent: number | null = null;
  let isPositive = true;

  if (previousValue !== undefined && currentValue !== undefined && previousValue > 0) {
    changePercent = ((currentValue - previousValue) / previousValue) * 100;
    isPositive = invertTrend ? changePercent <= 0 : changePercent >= 0;
  }

  return (
    <div className="kpi-card" data-accent={accent}>
      <div className="kpi-header">
        <span className="kpi-label">{title}</span>
        <div className="kpi-icon" data-accent={accent}>
          {ICONS[icon]}
        </div>
      </div>
      <div className="kpi-value">{formatValue(value, format)}</div>
      <div className="kpi-footer">
        {changePercent !== null && (
          <span className="kpi-trend" data-positive={String(isPositive)}>
            <svg viewBox="0 0 12 12" fill="currentColor">
              {changePercent >= 0 ? (
                <path d="M6 2l4 5H2z" />
              ) : (
                <path d="M6 10l4-5H2z" />
              )}
            </svg>
            {Math.abs(changePercent).toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="kpi-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}
