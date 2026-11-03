import React, { useState } from 'react';

/**
 * Entrupy's official logo, served from /brand/entrupy-logo.svg once the file from Entrupy's brand kit is added
 * (src/web/public/brand/). Until then — or if it fails to load — the name is shown as plain text.
 * Never redraw the logo by hand.
 */
export default function EntrupyLogo({ className = 'h-6' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="font-semibold tracking-tight">Entrupy</span>;
  return <img src="/brand/entrupy-logo.svg" alt="Entrupy" className={className} onError={() => setFailed(true)} />;
}
