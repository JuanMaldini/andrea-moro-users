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

// iPhone graba en .MOV con tipo video/quicktime. WhatsApp usa .mp4.
// A veces el File.type viene vacío en Safari iOS → lo inferimos por extensión.
function normalizeVideoType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "avi") return "video/x-msvideo";
  return "video/mp4"; // fallback seguro
}

export default function VideoUploader({ courseId, slug, course, videos, onVideosChange }: Props) {
  const [localVideos, setLocalVideos] = useState<CourseVideo[]>(videos);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pbUrl = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");
  const videoUrl = (filename: string) =>
    `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;

  // En cuanto el sistema operativo entrega los archivos (onChange), los ponemos
  // en cola y arrancamos la subida sin que el usuario tenga que hacer nada más.
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected.length) return;

    const startIdx = localVideos.length + 1;
    const items: UploadItem[] = selected.map((f, i) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const newName = `${slug}_${startIdx + i}.${ext}`;
      return { file: f, newName, status: "waiting" as const, progress: 0 };
    });

    setUploadItems(items);
    setAllDone(false);
    // Arranca automáticamente — sin modal ni botón extra.
    await runUpload(items);
  }

  async function runUpload(items: UploadItem[]) {
    const pb = getPocketBase();
    if (!pb.authStore.isValid) {
      alert("Sesión expirada. Recarga la página e inicia sesión de nuevo.");
      return;
    }

    setUploading(true);
    let newVideos = [...localVideos];

    for (let i = 0; i < items.length; i++) {
      setUploadItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "uploading", progress: 0 } : it))
      );
      const item = items[i];
      const type = normalizeVideoType(item.file);
      const renamed = new File([item.file], item.newName, { type });
      try {
        await uploadWithProgress(courseId, "files", [renamed], (pct) => {
          setUploadItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, progress: pct } : it))
          );
        });
        newVideos = [
          ...newVideos,
          { file: item.newName, name: item.newName, order: newVideos.length + 1 },
        ];
        setUploadItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "done", progress: 100 } : it))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setUploadItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "error", error: msg } : it))
        );
      }
    }

    try {
      await saveVideos(newVideos);
      // Actualiza el estado local para que el próximo lote numere bien.
      setLocalVideos(newVideos);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Los vídeos se subieron pero no se pudo guardar el orden: ${msg}`);
    }

    setUploading(false);
    setAllDone(true);
  }

  // Guarda json.videos mezclando sobre el json más reciente (no pisa gallery/keys).
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

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Vídeos ({localVideos.length})
        </h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Subiendo…" : "+ Añadir vídeos"}
        </button>
        {/* video/* + quicktime explícito cubre MOV de iPhone y MP4 de WhatsApp */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,video/quicktime,video/mp4"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Progreso inline — aparece en cuanto iOS entrega los archivos */}
      {uploadItems.length > 0 && (
        <div className="mb-4 space-y-3">
          {uploadItems.map((item, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-marroncalido truncate flex-1 mr-2">
                  {item.newName}
                </span>
                <span className={`text-xs font-mono flex-shrink-0 ${
                  item.status === "done"  ? "text-marron" :
                  item.status === "error" ? "text-rojo"   : "text-grisclarito"
                }`}>
                  {item.status === "uploading"
                    ? `${item.progress}%`
                    : item.status === "done"  ? "✓"
                    : item.status === "error" ? "✗"
                    : "·"}
                </span>
              </div>
              {(item.status === "uploading" || item.status === "done") && (
                <div className="h-0.5 w-full bg-grisoscuro overflow-hidden">
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
          ))}
          {uploading && (
            <p className="text-xs text-grisclarito">No cierres esta ventana mientras se suben…</p>
          )}
          {allDone && (
            <button
              onClick={() => { setUploadItems([]); setAllDone(false); }}
              className="text-xs text-grisclarito underline"
            >
              Limpiar
            </button>
          )}
        </div>
      )}

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
    </section>
  );
}
