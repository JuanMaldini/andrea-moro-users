"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { COURSE_PASSWORD } from "@/lib/auth";

interface Props {
  courseId: string;
  title: string;
  videosCount: number;
  /** URL pública del alumno — null si al curso le falta slug o token. */
  url: string | null;
  /** Todas las imágenes del curso (galería + recursos de imagen). */
  images: string[];
}

/** Intervalo del fundido del carrusel. */
const FADE_INTERVAL_MS = 3000;

/**
 * Botón de acción. `min-h-[44px]` es el mínimo táctil recomendado (Apple HIG);
 * `text-sm` es lo mínimo que se lee cómodo en un celular.
 */
const btn =
  "flex items-center justify-center min-h-[44px] px-2 text-sm font-semibold rounded " +
  "border border-marron text-marron bg-blanco " +
  "hover:bg-marron hover:text-blanco active:bg-marron active:text-blanco " +
  "transition-colors disabled:opacity-40 disabled:pointer-events-none";

export default function CourseCard({ courseId, title, videosCount, url, images }: Props) {
  const editHref = `/admin/cursos/${courseId}`;
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  // Solo se monta lo que ya se vio más la siguiente: al entrar se piden 2 fotos
  // por tarjeta en vez de las 20 del curso. El resto llega a medida que rota.
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0, 1]));

  // Carrusel automático: solo tiene sentido con más de una imagen.
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % images.length;
        // Precarga la siguiente para que el fundido no entre en blanco.
        setMounted((prev) => {
          const after = (next + 1) % images.length;
          if (prev.has(next) && prev.has(after)) return prev;
          const copy = new Set(prev);
          copy.add(next);
          copy.add(after);
          return copy;
        });
        return next;
      });
    }, FADE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [images.length]);

  function handleCopy() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleWhatsApp() {
    if (!url) return;
    const message = `${url}\nCLAVE: ${COURSE_PASSWORD}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function handleOpen() {
    if (!url) return;
    const isLocal =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const openUrl = isLocal ? url.replace(/^https?:\/\/[^/]+/, window.location.origin) : url;
    window.open(openUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="flex bg-blanco border border-marron/30 rounded-lg overflow-hidden hover:border-marron transition-colors">
      {/* Carrusel al lateral — toda la imagen entra al curso */}
      <Link
        href={editHref}
        aria-label={`Abrir ${title || "el curso"}`}
        className="relative w-[112px] sm:w-[124px] flex-shrink-0 self-stretch bg-gris200 overflow-hidden active:opacity-80 transition-opacity"
      >
        {images.map((src, i) =>
          mounted.has(i) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              draggable={false}
              // La primera se pide ya; el resto solo cuando la tarjeta entra en pantalla.
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className={`absolute inset-0 w-full h-full object-cover object-top select-none transition-opacity duration-1000 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : null
        )}
        {images.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-marron/50">
            Sin fotos
          </span>
        )}
      </Link>

      {/* Título + acciones */}
      <div className="flex-1 min-w-0 flex flex-col p-3 gap-2.5">
        <Link href={editHref} className="group block">
          <h2 className="text-base font-bold text-marron leading-snug line-clamp-2 group-hover:text-marroncalido transition-colors">
            {title || "Sin título"}
          </h2>
          <p className="text-xs text-grisclarito mt-1">
            {videosCount} {videosCount === 1 ? "vídeo" : "vídeos"}
          </p>
        </Link>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Link href={editHref} className={btn}>
            Editar
          </Link>
          <button type="button" onClick={handleWhatsApp} disabled={!url} className={btn}>
            WhatsApp
          </button>
          <button type="button" onClick={handleCopy} disabled={!url} title={url ?? undefined} className={btn}>
            {copied ? "✓ Copiado" : "Copiar"}
          </button>
          <button type="button" onClick={handleOpen} disabled={!url} className={btn}>
            Abrir
          </button>
        </div>
      </div>
    </article>
  );
}
