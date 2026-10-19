/** Three examiners above a desk line. */
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="9" cy="16" r="4.2" className="fill-prof" />
      <circle cx="16" cy="11" r="4.2" className="fill-brand" />
      <circle cx="23" cy="16" r="4.2" className="fill-eng" />
      <path d="M7 24.5h18" className="stroke-brand" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ large = false }) {
  return (
    <span className="flex items-center gap-2">
      <Mark size={large ? 30 : 26} />
      <span className={`${large ? "text-[19px]" : "text-[17px]"} font-bold tracking-tight text-ink`}>
        Viva<span className="font-serif text-[1.15em] font-normal italic text-brand">Panel</span>
      </span>
    </span>
  );
}
