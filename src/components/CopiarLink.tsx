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

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleCopy}
        title={url}
        className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-marron hover:text-marron transition-colors whitespace-nowrap"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
      <button
        onClick={handleWhatsApp}
        title="Compartir por WhatsApp"
        className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-[#25D366] hover:text-[#25D366] transition-colors whitespace-nowrap"
      >
        WhatsApp
      </button>
    </div>
  );
}
