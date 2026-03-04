'use client';

interface EfficiencyBadgeProps {
  type: 'OFF' | 'DEF';
  percentile: number;
  multiplier: number;
  size?: 'sm' | 'md';
}

function tierLabel(type: 'OFF' | 'DEF', percentile: number): string {
  const noun = type === 'OFF' ? 'OFF' : 'DEF';
  if (percentile >= 95) return `Elite ${noun}`;
  if (percentile >= 80) return `Strong ${noun}`;
  if (percentile >= 60) return `Good ${noun}`;
  return `Avg ${noun}`;
}

function multiplierColor(multiplier: number): string {
  if (multiplier >= 1.15) return 'bg-green-600 text-white';
  if (multiplier >= 1.10) return 'bg-green-500 text-white';
  if (multiplier >= 1.05) return 'bg-yellow-500 text-white';
  return 'bg-zinc-600 text-zinc-300';
}

/**
 * Compact badge showing efficiency tier and multiplier value.
 * Used in the mock draft player pool and the weekly scores breakdown.
 *
 * - Green   → 1.10x or higher (significant bonus)
 * - Yellow  → 1.05x (small bonus)
 * - Gray    → 1.00x (no bonus)
 */
export default function EfficiencyBadge({
  type,
  percentile,
  multiplier,
  size = 'sm',
}: EfficiencyBadgeProps) {
  const label = tierLabel(type, percentile);
  const colorClass = multiplierColor(multiplier);
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]';
  const padding  = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';

  if (multiplier === 1.00) {
    // Only show a minimal dot for 1.00x to save space
    return (
      <span
        title={`${label} — no multiplier`}
        className={`inline-flex items-center gap-1 rounded ${padding} ${textSize} font-medium ${colorClass}`}
      >
        {label} 1.00×
      </span>
    );
  }

  return (
    <span
      title={`${label} (${percentile}th percentile) — ${multiplier.toFixed(2)}× bonus`}
      className={`inline-flex items-center gap-1 rounded ${padding} ${textSize} font-semibold ${colorClass}`}
    >
      {label} {multiplier.toFixed(2)}×
    </span>
  );
}
