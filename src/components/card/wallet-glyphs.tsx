/** Small wallet logos for the "add to wallet" buttons (not the official badges). */
export function AppleWalletGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3.5" fill="currentColor" opacity=".25" />
      <rect x="3" y="7" width="18" height="4" fill="#ff4a1c" />
      <rect x="3" y="10" width="18" height="4" fill="#f5b400" />
      <rect x="3" y="13" width="18" height="7" rx="3" fill="currentColor" />
    </svg>
  );
}

export function GoogleWalletGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3.5" fill="#34A853" />
      <rect x="3" y="7.5" width="18" height="4" fill="#FBBC05" />
      <rect x="3" y="11" width="18" height="4" fill="#EA4335" />
      <rect x="3" y="14" width="18" height="6" rx="3" fill="#4285F4" />
    </svg>
  );
}
