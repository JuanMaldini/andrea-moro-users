"use client";

import { useState, useEffect } from "react";
import type { CourseVideo } from "@/lib/course-utils";

type State = "presentation" | "access" | "videos";

interface Props {
  courseId: string;
  token: string;
  title: string;
  description: string;
  videos: CourseVideo[];
  fileIds: string[];
  pbUrl: string;
  collectionName: string;
  published: boolean;
  gallery: string[];
}

const SESSION_KEY_PREFIX = "course_access_";

export default function CoursePageClient({
  courseId, token, title, description, videos,
  pbUrl, collectionName, published, gallery,
}: Props) {
  const sessionKey = `${SESSION_KEY_PREFIX}${token}`;
  const [state, setState] = useState<State>("presentation");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalVideo, setModalVideo] = useState<CourseVideo | null>(null);

  useEffect(() => {
    if (!published) return;
    try {
      const saved = sessionStorage.getItem(sessionKey);
      if (saved && JSON.parse(saved).validated) setState("videos");
    } catch { /* */ }
  }, [sessionKey, published]);

  // Close modal on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModalVideo(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleAccessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/validate-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, token, email: email.trim() }),
      });
      const { valid } = await res.json();
      if (valid) {
        try { sessionStorage.setItem(sessionKey, JSON.stringify({ validated: true })); } catch { /* */ }
        setState("videos");
      } else {
        setError("Clave no reconocida. Comprueba que es la correcta.");
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function fileUrl(filename: string) {
    return `${pbUrl}/api/files/${collectionName}/${courseId}/${filename}`;
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
          <div className="bg-blanco shadow-sm">
            <div className="h-48 bg-grisoscuro flex items-center justify-center">
              <span className="text-grisclarito text-xs uppercase tracking-widest">{title}</span>
            </div>
            <div className="px-8 py-8">
              <p className="text-xs uppercase tracking-widest text-grisclarito mb-3">Curso</p>
              <h1 className="text-2xl font-light text-marron mb-4">{title}</h1>
              {description && <p className="text-sm text-marroncalido leading-relaxed mb-8">{description}</p>}
              <p className="text-xs text-grisclarito mb-6">
                {videos.length} lección{videos.length !== 1 ? "es" : ""}
              </p>
              {published ? (
                <button onClick={() => setState("access")}
                  className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors">
                  Acceder al curso
                </button>
              ) : (
                <button disabled
                  className="w-full py-3 bg-grisoscuro text-grisclarito text-xs font-medium uppercase tracking-widest cursor-not-allowed">
                  Próximamente
                </button>
              )}
            </div>
          </div>
        )}

        {/* ACCESO */}
        {state === "access" && published && (
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
                  Tu correo o clave de acceso
                </label>
                <input id="clave" type="text" value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  required autoComplete="email" placeholder="tu@correo.com"
                  className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors" />
              </div>
              {error && <p className="text-rojo text-xs leading-relaxed">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Verificando..." : "Entrar"}
              </button>
            </form>
            <p className="text-center text-xs text-grisclarito mt-6">
              ¿Problemas?{" "}
              <a href="mailto:info@andreamorotienda.com" className="text-marron hover:underline">
                Contacta con Andrea
              </a>
            </p>
          </div>
        )}

        {/* VÍDEOS */}
        {state === "videos" && (
          <div>
            <p className="text-xs uppercase tracking-widest text-grisclarito mb-2">{title}</p>
            <h2 className="text-xl font-light text-marron mb-6">
              {videos.length} lección{videos.length !== 1 ? "es" : ""}
            </h2>

            <div className="bg-blanco shadow-sm divide-y divide-grisoscuro mb-8">
              {videos.map((video, idx) => (
                <button key={video.file} onClick={() => setModalVideo(video)}
                  className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-vanilla transition-colors">
                  <span className="text-xs w-5 text-right flex-shrink-0 text-grisclarito">{idx + 1}</span>
                  <span className="text-sm text-marroncalido">{video.name}</span>
                  <span className="ml-auto text-xs text-grisclarito">▶</span>
                </button>
              ))}
              {videos.length === 0 && (
                <p className="px-6 py-8 text-xs text-grisclarito text-center">Vídeos en preparación.</p>
              )}
            </div>

            {/* Galería */}
            {gallery.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-grisclarito mb-4">Galería</p>
                <div className="grid grid-cols-2 gap-2">
                  {gallery.map((filename) => (
                    <div key={filename} className="aspect-square bg-grisoscuro overflow-hidden">
                      <img src={fileUrl(filename)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de vídeo */}
      {modalVideo && (
        <div
          className="fixed inset-0 z-50 bg-negro bg-opacity-90 flex items-center justify-center px-4"
          onClick={() => setModalVideo(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-grisoscuro uppercase tracking-widest">{modalVideo.name}</p>
              <button onClick={() => setModalVideo(null)}
                className="text-grisoscuro hover:text-blanco text-lg transition-colors">
                ×
              </button>
            </div>
            <video
              key={fileUrl(modalVideo.file)}
              src={fileUrl(modalVideo.file)}
              controls autoPlay
              className="w-full aspect-video bg-negro"
            >
              Tu navegador no soporta vídeo HTML5.
            </video>
          </div>
        </div>
      )}
    </main>
  );
}
