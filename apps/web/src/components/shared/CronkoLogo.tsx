export function CronkoLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Cronko">
      {/* Outer ring — clock face */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />

      {/* Clock hands — pointing at ~2 o'clock (cron job time) */}
      <line
        x1="12"
        y1="12"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="12"
        x2="16.5"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Center dot — pulse/monitoring */}
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />

      {/* Pulse ring — monitoring signal */}
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    </svg>
  )
}
