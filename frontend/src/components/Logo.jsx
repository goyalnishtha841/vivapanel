/** Three examiners behind a desk, the middle one marking in red. */
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="8.5" cy="15" r="4" className="fill-prof" />
      <circle cx="16" cy="11" r="4" className="fill-brand" />
      <circle cx="23.5" cy="15" r="4" className="fill-eng" />
      <path d="M5 24.5c4-1.6 8.5-2 11-1.2s7 .9 11-.6" className="stroke-brand" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Wordmark in the GazeLens style: extrabold, second word in the accent. */
export default function Logo({ large = false }) {
  return (
    <span className={`inline-flex items-center ${large ? "gap-2.5" : "gap-2"}`}>
      <Mark size={large ? 30 : 26} />
      <span className={`font-extrabold tracking-[-0.02em] text-ink ${large ? "text-[22px]" : "text-[19px]"}`}>
        Viva<span className="text-brand">Panel</span>
      </span>
    </span>
  );
}
