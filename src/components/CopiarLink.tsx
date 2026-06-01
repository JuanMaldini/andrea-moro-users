"use client";

import { useState } from "react";

interface Props {
  url: string;
}

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
    window.open(
      `https://wa.me/?text=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
      <button
        onClick={handleCopy}
        title={url}
        className="text-xs md:text-sm font-semibold text-blanco border-2 border-marron bg-marron px-3 md:px-4 py-1.5 md:py-2 hover:bg-marroncalido hover:border-marroncalido hover:shadow-md transition-all duration-200 rounded"
      >
        {copied ? "✓ Copiado" : "Copiar"}
      </button>
      <button
        onClick={handleWhatsApp}
        title="Compartir por WhatsApp"
        className="text-xs md:text-sm font-semibold text-blanco border-2 border-marron bg-marron px-3 md:px-4 py-1.5 md:py-2 hover:bg-marroncalido hover:border-marroncalido hover:shadow-md transition-all duration-200 rounded"
      >
        WhatsApp
      </button>
      <button
        onClick={handleOpen}
        title="Abrir el curso en una pestaña nueva"
        className="text-xs md:text-sm font-semibold text-blanco border-2 border-marron bg-marron px-3 md:px-4 py-1.5 md:py-2 hover:bg-marroncalido hover:border-marroncalido hover:shadow-md transition-all duration-200 rounded"
      >
        Abrir
      </button>
    </div>
  );
}
