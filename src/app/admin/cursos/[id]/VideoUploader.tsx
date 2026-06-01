"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { uploadWithProgress } from "@/lib/upload";
import type { CourseVideo, CourseJson, CourseRecord } from "@/lib/course-utils";

interface UploadItem {
  file: File;
  newName: string;
  status: "waiting" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface Props {
  courseId: string;
  slug: string;
  course: CourseRecord;
  videos: CourseVideo[];
  onVideosChange: (videos: CourseVideo[]) => void;
}

export default function VideoUploader({ courseId, slug, course, videos, onVideosChange }: Props) {
  const [localVideos, setLocalVideos] = useState<CourseVideo[]>(videos);
  const [showModal, setShowModal] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pbUrl = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");
  const videoUrl = (filename: string) =>
    `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const startIdx = localVideos.length + 1;
    const items: UploadItem[] = selected.map((f, i) => {
      const ext = f.name.split(".").pop() ?? "mp4";
      const newName = `${slug}_${startIdx + i}.${ext}`;
      return { file: f, newName, status: "waiting", progress: 0 };
    });
    setUploadItems(items);
    setAllDone(false);
    setShowModal(true);
    e.target.value = "";
  }

  async function startUpload() {
    setUploading(true);
    const pb = getPocketBase();

    if (!pb.authStore.isValid) {
      alert("Sesión expirada. Recarga la página e inicia sesión de nuevo.");
      setUploading(false);
      return;
    }

    let newVideos = [...localVideos];

    for (let i = 0; i < uploadItems.length; i++) {
      setUploadItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "uploading", progress: 0 } : it))
      );
      const item = uploadItems[i];
      const renamed = new File([item.file], item.newName, { type: item.file.type });
      try {
        // files+ → añade sin borrar los vídeos ya subidos. Con progreso real.
        await uploadWithProgress(courseId, "files", [renamed], (pct) => {
          setUploadItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, progress: pct } : it))
          );
        });
        const newVideo: CourseVideo = {
          file: item.newName,
          name: item.newName,
          order: newVideos.length + 1,
        };
        newVideos = [...newVideos, newVideo];
        setUploadItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "done", progress: 100 } : it))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setUploadItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "error", error: msg } : it
          )
        );
      }
    }

    // Save updated json.videos (mezclando sobre el json más reciente)
    try {
      await saveVideos(newVideos);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Los vídeos se subieron pero no se pudo guardar el orden: ${msg}`);
    }

    setUploading(false);
    setAllDone(true);
  }

  // Guarda json.videos mezclando sobre el json más reciente (no pisa gallery/keys).
  // No toca el estado local: la UI ya se actualizó de forma optimista.
  async function saveVideos(newVideos: CourseVideo[]) {
    const pb = getPocketBase();
    const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
    const updatedJson: CourseJson = { ...latest.json, videos: newVideos };
    await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
    onVideosChange(newVideos);
  }

  async function moveVideo(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= localVideos.length) return;
    const prev = localVideos;
    const updated = [...localVideos];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const reordered = updated.map((v, i) => ({ ...v, order: i + 1 }));
    // Optimista: reordena en la UI al instante.
    setLocalVideos(reordered);
    try {
      await saveVideos(reordered);
    } catch (err: unknown) {
      setLocalVideos(prev);
      onVideosChange(prev);
      alert(`Error al reordenar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function deleteVideo(video: CourseVideo) {
    const prev = localVideos;
    const updated = localVideos
      .filter((v) => v.file !== video.file)
      .map((v, i) => ({ ...v, order: i + 1 }));
    // Optimista: quita el vídeo de la UI al instante.
    setLocalVideos(updated);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(courseId, { "files-": [video.file] });
      await saveVideos(updated);
    } catch (err: unknown) {
      setLocalVideos(prev);
      onVideosChange(prev);
      alert(`Error al eliminar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const statusIcon = (s: UploadItem["status"]) =>
    ({ waiting: "·", uploading: "↑", done: "✓", error: "✗" })[s];

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Vídeos ({localVideos.length})
        </h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors"
        >
          + Añadir vídeos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <div className="space-y-2">
        {localVideos.map((v, idx) => (
          <div key={v.file} className="bg-blanco shadow-sm px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-grisclarito w-5 text-right flex-shrink-0">{idx + 1}</span>
            <video
              src={videoUrl(v.file)}
              className="w-24 h-14 object-cover bg-grisoscuro flex-shrink-0"
              preload="metadata"
              muted
              controls
            />
            <p className="flex-1 min-w-0 text-sm text-marroncalido truncate font-mono">{v.file}</p>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => moveVideo(idx, -1)} disabled={idx === 0}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                ↑
              </button>
              <button onClick={() => moveVideo(idx, 1)} disabled={idx === localVideos.length - 1}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                ↓
              </button>
              <button onClick={() => deleteVideo(v)}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-rojo hover:text-rojo transition-colors">
                ×
              </button>
            </div>
          </div>
        ))}
        {localVideos.length === 0 && (
          <p className="text-xs text-grisclarito text-center py-6">Sin vídeos. Añade el primero arriba.</p>
        )}
      </div>

      {/* Modal de subida */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-marron bg-opacity-30 flex items-center justify-center px-4">
          <div className="bg-blanco w-full max-w-md shadow-lg px-6 py-8">
            <p className="text-xs uppercase tracking-widest text-marroncalido mb-6">Subiendo vídeos</p>
            <div className="space-y-4 mb-6">
              {uploadItems.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className={`text-sm flex-shrink-0 font-mono ${
                    item.status === "done" ? "text-marron" :
                    item.status === "error" ? "text-rojo" : "text-grisclarito"
                  }`}>
                    {statusIcon(item.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-marron font-mono truncate">{item.newName}</p>
                    {/* Barra de progreso minimal */}
                    {(item.status === "uploading" || item.status === "done") && (
                      <div className="mt-1 h-1 w-full bg-grisoscuro overflow-hidden">
                        <div
                          className="h-full bg-marron transition-[width] duration-150"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.error && (
                      <p className="text-xs text-rojo mt-0.5 break-words">{item.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!uploading && !allDone && (
              <button onClick={startUpload}
                className="w-full py-3 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors">
                Iniciar subida
              </button>
            )}
            {uploading && (
              <p className="text-xs text-grisclarito text-center">Subiendo, no cierres esta ventana…</p>
            )}
            {allDone && (
              <button onClick={() => setShowModal(false)}
                className="w-full py-3 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors">
                Listo — cerrar
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
