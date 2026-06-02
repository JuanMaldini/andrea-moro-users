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

// ─── Utilidades ──────────────────────────────────────────────────────────────

function normalizeVideoType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "avi") return "video/x-msvideo";
  return "video/mp4";
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Extensiones que Chrome/Firefox NO reproducen (solo Safari/Apple).
const POTENTIALLY_UNSUPPORTED = ["mov", "avi", "mkv", "wmv", "flv", "m2ts", "mts"];

// Nombre de display canónico para un vídeo: slug_N (sin extensión).
function displayName(slug: string, order: number): string {
  return `${slug}_${order}`;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function VideoUploader({ courseId, slug, course, videos, onVideosChange }: Props) {
  const [localVideos, setLocalVideos] = useState<CourseVideo[]>(videos);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);

  // Duración extraída via onLoadedMetadata (filename → segundos)
  const [durations, setDurations] = useState<Record<string, number>>({});
  // Errores de carga (filename → mensaje)
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  // Vídeos cuyo metadata cargó sin error
  const [videoLoaded, setVideoLoaded] = useState<Record<string, boolean>>({});
  // Vídeo que se está reproduciendo en el modal
  const [playingVideo, setPlayingVideo] = useState<CourseVideo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pbUrl = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

  // Los archivos son públicos en PocketBase (API rules vacías) → URL simple sin token.
  // Esto también evita el hydration mismatch que ocurría al añadir ?token= solo en cliente.
  function videoUrl(filename: string): string {
    return `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
  }

  function handleVideoLoadedMetadata(filename: string, e: React.SyntheticEvent<HTMLVideoElement>) {
    const dur = e.currentTarget.duration;
    if (isFinite(dur) && dur > 0) {
      setDurations((prev) => ({ ...prev, [filename]: dur }));
    }
    setVideoLoaded((prev) => ({ ...prev, [filename]: true }));
    setVideoErrors((prev) => {
      if (!prev[filename]) return prev;
      const next = { ...prev };
      delete next[filename];
      return next;
    });
  }

  function handleVideoError(filename: string) {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const msg = POTENTIALLY_UNSUPPORTED.includes(ext)
      ? `Formato .${ext} no reproducible en Chrome/Firefox. Convierte a MP4 H.264.`
      : "No se pudo cargar el vídeo.";
    setVideoErrors((prev) => ({ ...prev, [filename]: msg }));
    setVideoLoaded((prev) => ({ ...prev, [filename]: false }));
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected.length) return;

    const problematic = selected.filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return POTENTIALLY_UNSUPPORTED.includes(ext);
    });
    if (problematic.length > 0) {
      const names = problematic.map((f) => f.name).join(", ");
      const ok = window.confirm(
        `⚠ Estos archivos pueden no reproducirse en Chrome/Firefox:\n\n${names}\n\n` +
        `Los formatos MOV de iPhone usan H.265/HEVC que Chrome no soporta.\n\n` +
        `¿Continuar de todas formas? (En Safari sí funcionarán.)`
      );
      if (!ok) return;
    }

    const startIdx = localVideos.length + 1;
    const items: UploadItem[] = selected.map((f, i) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const newName = `${slug}_${startIdx + i}.${ext}`;
      return { file: f, newName, status: "waiting" as const, progress: 0 };
    });

    setUploadItems(items);
    setAllDone(false);
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
        const filesBefore = new Set(newVideos.map((v) => v.file));

        const updatedRecord = await uploadWithProgress<CourseRecord>(courseId, "files", [renamed], (pct) => {
          setUploadItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, progress: pct } : it))
          );
        });

        // Nombre real que asignó PocketBase (puede añadir sufijo aleatorio)
        const actualFilename =
          updatedRecord.files?.find((f) => !filesBefore.has(f)) ?? item.newName;

        const order = newVideos.length + 1;
        newVideos = [
          ...newVideos,
          {
            file: actualFilename,
            name: displayName(slug, order), // nombre de display: slug_N
            order,
          },
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
      setLocalVideos(newVideos);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Los vídeos se subieron pero no se pudo guardar el orden: ${msg}`);
    }

    setUploading(false);
    setAllDone(true);
  }

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
    // Reordenar y recalcular display names según nueva posición
    const reordered = updated.map((v, i) => ({
      ...v,
      order: i + 1,
      name: displayName(slug, i + 1),
    }));
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
      .map((v, i) => ({
        ...v,
        order: i + 1,
        name: displayName(slug, i + 1), // renumerar display names
      }));
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
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,video/quicktime,video/mp4"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Progreso inline */}
      {uploadItems.length > 0 && (
        <div className="mb-4 space-y-3">
          {uploadItems.map((item, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-marroncalido truncate flex-1 mr-2">
                  {displayName(slug, localVideos.length + idx + 1)}
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

      {/* Lista de vídeos */}
      <div className="space-y-2">
        {localVideos.map((v, idx) => {
          const dur = durations[v.file];
          const err = videoErrors[v.file];
          const loaded = videoLoaded[v.file];
          const ext = v.file.split(".").pop()?.toLowerCase() ?? "";
          const isUnsupportedExt = POTENTIALLY_UNSUPPORTED.includes(ext);

          return (
            <div key={v.file} className="bg-blanco shadow-sm px-4 py-3 flex items-center gap-3">
              <span className="text-xs text-grisclarito w-5 text-right flex-shrink-0">{idx + 1}</span>

              {/* Thumbnail — click abre el reproductor */}
              <button
                type="button"
                onClick={() => !err && setPlayingVideo(v)}
                className="relative flex-shrink-0 w-24 h-14 group focus:outline-none"
                title={err ? undefined : "Reproducir"}
              >
                {err ? (
                  <div className="w-24 h-14 bg-grisoscuro flex flex-col items-center justify-center gap-1 rounded-sm">
                    <span className="text-xl">🎬</span>
                    <span className="text-[9px] text-grisclarito uppercase">.{ext}</span>
                  </div>
                ) : (
                  <video
                    src={videoUrl(v.file)}
                    className="w-24 h-14 object-cover bg-grisoscuro rounded-sm"
                    preload="metadata"
                    playsInline
                    muted
                    onLoadedMetadata={(e) => handleVideoLoadedMetadata(v.file, e)}
                    onError={() => handleVideoError(v.file)}
                  />
                )}
                {/* Overlay play al hover */}
                {!err && loaded && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-sm bg-negro/0 group-hover:bg-negro/40 transition-colors">
                    <span className="text-blanco text-base opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                  </div>
                )}
                {/* Badge duración */}
                {dur && loaded && (
                  <span className="absolute bottom-1 right-1 bg-negro/70 text-blanco text-[10px] px-1 leading-tight rounded-sm pointer-events-none">
                    {formatDuration(dur)}
                  </span>
                )}
              </button>

              {/* Display name + estado */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-marroncalido font-mono font-semibold">
                  {v.name || displayName(slug, idx + 1)}
                </p>
                {err ? (
                  <p className="text-[11px] text-rojo mt-0.5 leading-tight">{err}</p>
                ) : !loaded && !dur ? (
                  <p className="text-[11px] text-grisclarito mt-0.5 animate-pulse">Cargando…</p>
                ) : dur ? (
                  <p className="text-[11px] text-grisclarito mt-0.5">{formatDuration(dur)}</p>
                ) : null}
                {isUnsupportedExt && !err && (
                  <p className="text-[11px] text-yellow-600 mt-0.5">
                    ⚠ .{ext} solo en Safari. Convierte a MP4 H.264.
                  </p>
                )}
              </div>

              {/* Controles orden / borrar */}
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
          );
        })}

        {localVideos.length === 0 && (
          <p className="text-xs text-grisclarito text-center py-6">Sin vídeos. Añade el primero arriba.</p>
        )}
      </div>

      {/* Modal reproductor inline */}
      {playingVideo && (
        <div
          className="fixed inset-0 z-50 bg-negro/90 flex items-center justify-center px-4"
          onClick={() => setPlayingVideo(null)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-grisoscuro font-mono">
                {playingVideo.name || displayName(slug, localVideos.findIndex(v => v.file === playingVideo.file) + 1)}
              </p>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-grisoscuro hover:text-blanco text-xl transition-colors"
              >
                ×
              </button>
            </div>
            <video
              key={playingVideo.file}
              src={videoUrl(playingVideo.file)}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-negro block rounded-sm"
            />
          </div>
        </div>
      )}
    </section>
  );
}
