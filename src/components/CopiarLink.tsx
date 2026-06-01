"use client";

import { useState } from "react";

interface Props {
  url: string;
}

const btn = "text-xs font-semibold border border-marron text-marron px-3 py-1 hover:bg-marron hover:text-blanco transition-colors";

export default function CopiarLink({ url }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleWhatsApp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  }

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const openUrl = isLocal ? url.replace(/^https?:\/\/[^/]+/, window.location.origin) : url;
    window.open(openUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button onClick={handleOpen}      title="Abrir el curso"           className={btn}>Abrir</button>
      <button onClick={handleCopy}      title={url}                      className={btn}>{copied ? "✓ Copiado" : "Copiar"}</button>
      <button onClick={handleWhatsApp}  title="Compartir por WhatsApp"   className={btn}>WhatsApp</button>
    </>
  );
}
