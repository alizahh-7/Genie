/** Illustrated, faceless CSS/SVG avatars for the fictional demo people. Decorative only. */
export function Avatar({ variant, label }: { variant: "nani" | "sana"; label: string }) {
  const nani = variant === "nani";
  const bg = nani ? ["#f4c970", "#c47a5a"] : ["#7fd3d0", "#5a63b8"];
  const id = `av-${variant}`;
  return (
    <svg role="img" aria-label={label} viewBox="0 0 120 120" className="h-24 w-24 shrink-0 rounded-full shadow-[0_0_30px_rgba(244,201,112,.2)]">
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bg[0]} /><stop offset="1" stopColor={bg[1]} /></linearGradient></defs>
      <rect width="120" height="120" fill={`url(#${id})`} />
      {nani ? <>
        <circle cx="60" cy="24" r="13" fill="#d9d4e6" />
        <path d="M18 120c2-30 20-42 42-42s40 12 42 42z" fill="#8f3f5b" />
        <path d="M30 120c4-20 16-30 30-30s26 10 30 30z" fill="#c9708a" opacity=".7" />
        <ellipse cx="60" cy="55" rx="22" ry="25" fill="#e8b48f" />
        <path d="M37 50c0-18 10-28 23-28s23 10 23 28c-6-10-14-14-23-14s-17 4-23 14z" fill="#d9d4e6" />
      </> : <>
        <path d="M32 120c0-30 12-42 28-42s28 12 28 42z" fill="#2f3f86" />
        <path d="M60 80l-10 40h20z" fill="#e9eefc" opacity=".85" />
        <ellipse cx="60" cy="54" rx="21" ry="24" fill="#f0c9a4" />
        <path d="M36 58c-4-26 8-40 24-40s28 14 24 40c-2-12-6-22-12-26-8 4-20 4-26 0-6 6-8 16-10 26z" fill="#1d1a33" />
        <path d="M36 58c-2 14 0 22 6 28-2-10-2-18-1-26zM84 58c2 14 0 22-6 28 2-10 2-18 1-26z" fill="#1d1a33" />
      </>}
    </svg>
  );
}
