const base = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const Check = (p) => (<svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7" /></svg>);
export const Cross = (p) => (<svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Github = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 .5a11.5 11.5 0 00-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0012 .5z" /></svg>);
export const Mic = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>);
export const Send = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Speaker = ({ off, ...p }) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M4 9v6h4l5 4V5L8 9H4z" />{off ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}</svg>);
export const Sun = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const Moon = (p) => (<svg width="18" height="18" viewBox="0 0 24 24" {...base} {...p}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>);
export const Wrench = (p) => (<svg width="14" height="14" viewBox="0 0 24 24" {...base} {...p}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" /></svg>);
export const File = (p) => (<svg width="13" height="13" viewBox="0 0 24 24" {...base} {...p}><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z" /><path d="M14 3v5h5" /></svg>);
export const Copy = (p) => (<svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 011-1h10" /></svg>);
export const Print = (p) => (<svg width="16" height="16" viewBox="0 0 24 24" {...base} {...p}><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>);
