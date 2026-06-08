"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COURSE_PASSWORD } from "@/lib/auth";

interface Props {
  url: string;
  courseId: string;
}

const btn = "flex-1 min-w-0 text-center text-[10px] md:text-xs font-semibold border border-marron text-marron px-1 py-1 whitespace-nowrap hover:bg-marron hover:text-blanco transition-colors";

export default function CopiarLink({ url, courseId }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleEdit(e: React.MouseEvent) {
    stop(e);
    router.push(`/admin/cursos/${courseId}`);
  }

  function handleCopy(e: React.MouseEvent) {
    stop(e);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleWhatsApp(e: React.MouseEvent) {
    stop(e);
    const message = `${url}\nCLAVE: ${COURSE_PASSWORD}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function handleOpen(e: React.MouseEvent) {
    stop(e);
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const openUrl = isLocal ? url.replace(/^https?:\/\/[^/]+/, window.location.origin) : url;
    window.open(openUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button onClick={handleEdit}      title="Editar el curso"          className={btn}>Editar</button>
      <button onClick={handleWhatsApp}  title="Compartir por WhatsApp"   className={btn}>WhatsApp</button>
      <button onClick={handleCopy}      title={url}                      className={btn}>{copied ? "✓ Copiado" : "Copiar"}</button>
      <button onClick={handleOpen}      title="Abrir el curso"           className={btn}>Abrir</button>
    </>
  );
}
