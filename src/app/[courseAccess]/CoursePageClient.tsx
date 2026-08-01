"use client";

import { useState, useEffect, useRef } from "react";
import { resourceKind, type CourseVideo, type CourseResource } from "@/lib/course-utils";
import { COURSE_PASSWORD } from "@/lib/auth";

type State = "presentation" | "access" | "videos";

interface Props {
  courseId: string;
  token: string;
  title: string;
  description: string;
  videos: CourseVideo[];
  resources: CourseResource[];
  pbUrl: string;
  collectionName: string;
  gallery: string[];
}

const SESSION_KEY = "course_access_global";

export default function CoursePageClient({
  courseId, token, title, description, videos, resources,
  pbUrl, collectionName, gallery,
}: Props) {
  const sessionKey = SESSION_KEY;
  const [state, setState] = useState<State>("presentation");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [modalVideo, setModalVideo] = useState<CourseVideo | null>(null);
  const [modalVideoError, setModalVideoError] = useState<string | null>(null);
  const [previewResource, setPreviewResource] = useState<CourseResource | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved && JSON.parse(saved).validated) setState("videos");
    } catch { /* */ }
  }, [sessionKey]);

  // Close modal on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setModalVideo(null); setPreviewResource(null); closeLightbox(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Limpia el timer del lightbox si el componente se desmonta antes de que termine.
  useEffect(() => {
    return () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); };
  }, []);

  function handleAccessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (clave.trim().toLowerCase() === COURSE_PASSWORD.toLowerCase()) {
      try { sessionStorage.setItem(sessionKey, JSON.stringify({ validated: true })); } catch { /* */ }
      setState("videos");
    } else {
      setError("Clave no reconocida. Comprueba que es la correcta.");
    }
  }

  function openLightbox(img: string) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setLightboxImg(img);
    // Un frame de margen para que el elemento esté en el DOM antes de la transición
    requestAnimationFrame(() => requestAnimationFrame(() => setLightboxVisible(true)));
  }

  function closeLightbox() {
    setLightboxVisible(false);
    closeTimerRef.current = setTimeout(() => setLightboxImg(null), 220);
  }

  function fileUrl(filename: string) {
    return `${pbUrl}/api/files/${collectionName}/${courseId}/${filename}`;
  }

  // `?download=1` hace que PocketBase responda con Content-Disposition: attachment.
  function downloadUrl(filename: string) {
    return `${fileUrl(filename)}?download=1`;
  }

  return (
    <main className="min-h-screen bg-vanilla">
      <header className="border-b border-grisoscuro bg-blanco px-6 py-4">
        <p className="text-xs tracking-[0.2em] uppercase text-grisclarito text-center">
          Andrea Moro · Cursos
        </p>
      </header>

      <div className="max-w-xl mx-auto px-4 py-12">

        {/* PRESENTACIÓN */}
        {state === "presentation" && (
          <div className="bg-blanco shadow-sm rounded-lg overflow-hidden">
            <div className="relative h-48 bg-grisoscuro flex items-center justify-center overflow-hidden">
              {gallery.length > 0 && (
                <img
                  src={fileUrl(gallery[0])}
                  alt=""
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  className="absolute inset-0 w-full h-full object-cover object-center select-none"
                />
              )}
              {gallery.length > 0 && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-black/10" />
              )}
              <span className={`relative z-10 text-xs uppercase tracking-widest ${gallery.length > 0 ? "text-blanco" : "text-grisclarito"}`}>
                {title}
              </span>
            </div>
            <div className="px-8 py-8">
              <p className="text-xs uppercase tracking-widest text-grisclarito mb-3">Curso</p>
              <h1 className="text-2xl font-light text-marron mb-4">{title}</h1>
              {description && <p className="text-sm text-marroncalido leading-relaxed mb-8">{description}</p>}
              <p className="text-xs text-grisclarito mb-6">
                {videos.length} lección{videos.length !== 1 ? "es" : ""}
              </p>
              <button onClick={() => setState("access")}
                className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors">
                Acceder al curso
              </button>
            </div>
          </div>
        )}

        {/* ACCESO */}
        {state === "access" && (
          <div className="bg-blanco shadow-sm px-8 py-10">
            <button onClick={() => setState("presentation")}
              className="text-xs text-grisclarito hover:text-marron mb-8 inline-block transition-colors">
              ← Volver
            </button>
            <p className="text-xs uppercase tracking-widest text-grisclarito mb-2">{title}</p>
            <h2 className="text-xl font-light text-marron mb-8">Acceso</h2>
            <form onSubmit={handleAccessSubmit} className="space-y-5">
              <div>
                <label htmlFor="clave"
                  className="block text-xs font-medium uppercase tracking-widest text-marroncalido mb-2">
                  Clave de acceso
                </label>
                <input id="clave" type="password" value={clave}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClave(e.target.value)}
                  required autoComplete="off" placeholder="Ingresá la clave"
                  className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors" />
              </div>
              {error && <p className="text-rojo text-xs leading-relaxed">{error}</p>}
              <button type="submit"
                className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors">
                Entrar
              </button>
            </form>
          </div>
        )}

        {/* VÍDEOS */}
        {state === "videos" && (
          <div>
            <p className="text-xs uppercase tracking-widest text-grisclarito mb-2">{title}</p>
            {description && (
              <p className="text-sm text-marroncalido leading-relaxed mb-4">{description}</p>
            )}
            <h2 className="text-xl font-light text-marron mb-6">
              {videos.length} lección{videos.length !== 1 ? "es" : ""}
            </h2>

            <div className="bg-blanco shadow-sm divide-y divide-grisoscuro">
              {videos.map((video, idx) => (
                <button
                  key={video.file}
                  onClick={() => { setModalVideoError(null); setModalVideo(video); }}
                  className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-vanilla transition-colors"
                >
                  {/* Número */}
                  <span className="text-xs w-5 text-right flex-shrink-0 text-grisclarito">{idx + 1}</span>

                  {/* Nombre */}
                  <span className="flex-1 text-sm text-marroncalido text-left leading-snug">{video.name}</span>

                  {/* Icono play */}
                  <span className="text-xs text-grisclarito flex-shrink-0">▶</span>
                </button>
              ))}
              {videos.length === 0 && (
                <p className="px-6 py-8 text-xs text-grisclarito text-center">Vídeos en preparación.</p>
              )}
            </div>

            {/* RECURSOS — material de apoyo descargable */}
            {resources.length > 0 && (
              <div className="mt-10">
                <p className="text-xs uppercase tracking-widest text-grisclarito mb-4">Recursos</p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "6px",
                  }}
                >
                  {resources.map((r) => {
                    const kind = resourceKind(r.file);
                    const ext = r.file.split(".").pop()?.toLowerCase() ?? "";

                    return (
                      <button
                        key={r.file}
                        onClick={() => setPreviewResource(r)}
                        title={r.name}
                        className="aspect-square bg-grisoscuro overflow-hidden focus:outline-none hover:shadow transition-shadow duration-150"
                      >
                        {kind === "image" ? (
                          <img
                            src={fileUrl(r.file)}
                            alt={r.name}
                            draggable={false}
                            className="w-full h-full object-cover select-none"
                          />
                        ) : kind === "video" ? (
                          <video
                            src={fileUrl(r.file)}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            playsInline
                            muted
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                            <span className="text-3xl">{kind === "pdf" ? "📄" : "📎"}</span>
                            <span className="text-[10px] text-grisclarito uppercase">.{ext}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Galería — fuera del max-w-xl para crecer hasta 4 cols sin reducir tamaño */}
      {state === "videos" && gallery.length > 0 && (
        <div className="px-4 pt-8 pb-12">
          <p className="text-xs uppercase tracking-widest text-grisclarito mb-4 max-w-xl mx-auto">Galería</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "6px",
              maxWidth: "720px",
              margin: "0 auto",
            }}
          >
            {gallery.map((filename) => (
              <button
                key={filename}
                onClick={() => openLightbox(filename)}
                className="aspect-square bg-grisoscuro overflow-hidden focus:outline-none hover:shadow transition-shadow duration-150"
              >
                <img
                  src={fileUrl(filename)}
                  alt=""
                  draggable={false}
                  className="w-full h-full object-cover select-none"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal de recurso — previsualización + botón de descarga al lado */}
      {previewResource && (
        <div
          className="fixed inset-0 z-50 bg-negro/90 flex items-center justify-center px-4 py-8"
          onClick={() => setPreviewResource(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* Cabecera: descargar (izquierda, solo icono) + cerrar */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <a
                href={downloadUrl(previewResource.file)}
                download={previewResource.original}
                title="Descargar"
                aria-label="Descargar"
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-base text-blanco bg-marron hover:bg-marroncalido transition-colors"
              >
                ↓
              </a>
              <button
                onClick={() => setPreviewResource(null)}
                className="text-grisoscuro hover:text-blanco text-xl leading-none transition-colors flex-shrink-0"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Previsualización según tipo */}
            {(() => {
              const kind = resourceKind(previewResource.file);
              if (kind === "image") {
                return (
                  <img
                    src={fileUrl(previewResource.file)}
                    alt={previewResource.name}
                    draggable={false}
                    className="w-full max-h-[75vh] object-contain select-none"
                  />
                );
              }
              if (kind === "video") {
                return (
                  <video
                    key={previewResource.file}
                    src={fileUrl(previewResource.file)}
                    controls
                    autoPlay
                    playsInline
                    className="w-full aspect-video bg-negro block"
                  />
                );
              }
              if (kind === "pdf") {
                return (
                  <iframe
                    key={previewResource.file}
                    src={fileUrl(previewResource.file)}
                    title={previewResource.name}
                    className="w-full h-[75vh] bg-blanco block border-0"
                  />
                );
              }
              return (
                <div className="bg-blanco px-6 py-10 text-center">
                  <p className="text-sm text-marroncalido">
                    Este archivo no se puede previsualizar. Usá el botón de descarga.
                  </p>
                  <p className="text-xs text-grisclarito mt-2 break-all">
                    {previewResource.original}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Lightbox de imagen — fade in/out, fondo oscuro + blur, sin botones, sin crop */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8 pt-12"
          style={{
            backgroundColor: `rgba(0,0,0,${lightboxVisible ? 0.88 : 0})`,
            backdropFilter: `blur(${lightboxVisible ? 8 : 0}px)`,
            WebkitBackdropFilter: `blur(${lightboxVisible ? 8 : 0}px)`,
            transition: "background-color 220ms ease, backdrop-filter 220ms ease, -webkit-backdrop-filter 220ms ease",
          }}
          onClick={closeLightbox}
        >
          {/* stopPropagation solo en la imagen: el padding queda libre para cerrar */}
          <img
            src={fileUrl(lightboxImg)}
            alt=""
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-full object-contain select-none"
            style={{
              touchAction: "none",
              WebkitUserDrag: "none",
              opacity: lightboxVisible ? 1 : 0,
              transform: lightboxVisible ? "scale(1)" : "scale(0.97)",
              transition: "opacity 220ms ease, transform 220ms ease",
            } as React.CSSProperties}
          />
        </div>
      )}

      {/* Modal de vídeo */}
      {modalVideo && (
        <div
          className="fixed inset-0 z-50 bg-negro bg-opacity-90 flex items-center justify-center px-4 py-8"
          onClick={() => setModalVideo(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* Cabecera modal */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-grisoscuro uppercase tracking-widest truncate flex-1 mr-4">
                {modalVideo.name}
              </p>
              <button
                onClick={() => setModalVideo(null)}
                className="text-grisoscuro hover:text-blanco text-xl leading-none transition-colors flex-shrink-0"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            {/* Reproductor */}
            <video
              key={fileUrl(modalVideo.file)}
              src={fileUrl(modalVideo.file)}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-negro block"
              onError={(e) => {
                const err = (e.currentTarget as HTMLVideoElement).error;
                const msgs: Record<number, string> = {
                  2: "Error de red al cargar el vídeo. Comprueba tu conexión.",
                  3: "El navegador no puede decodificar este vídeo. Puede que esté en formato H.265/HEVC (iPhone). Prueba con Safari o convierte el vídeo.",
                  4: "Este vídeo no está disponible o el formato no es soportado por tu navegador.",
                };
                const code = err?.code ?? 0;
                setModalVideoError(msgs[code] ?? "No se pudo reproducir el vídeo.");
              }}
              onPlay={() => setModalVideoError(null)}
            />

            {/* Mensaje de error de reproducción */}
            {modalVideoError && (
              <div className="mt-3 px-4 py-3 bg-rojo/10 border border-rojo/40 text-rojo text-xs leading-relaxed rounded">
                ⚠ {modalVideoError}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
