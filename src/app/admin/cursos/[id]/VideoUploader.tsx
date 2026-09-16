"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_VIDEOS, pbFileUrl } from "@/lib/pocketbase-browser";
import { createWithProgress, formatBytes } from "@/lib/upload";
import type { VideoRecord } from "@/lib/course-utils";
import { useSnackbar } from "@/components/Snackbar";

interface UploadItem {
  file: File;
  label: string; // nombre de display fijado al elegir el archivo (slug_N)
  status: "waiting" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
}

interface Props {
  courseId: string;
  slug: string;
  videos: VideoRecord[];
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

export default function VideoUploader({ courseId, slug, videos }: Props) {
  const [localVideos, setLocalVideos] = useState<VideoRecord[]>(videos);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);

  // Duración extraída via onLoadedMetadata (id → segundos)
  const [durations, setDurations] = useState<Record<string, number>>({});
  // Errores de carga (id → mensaje)
  const [videoErrors, setVideoErrors] = useState<Record<string, string>>({});
  // Vídeos cuyo metadata cargó sin error
  const [videoLoaded, setVideoLoaded] = useState<Record<string, boolean>>({});
  // Vídeo que se está reproduciendo en el modal
  const [playingVideo, setPlayingVideo] = useState<VideoRecord | null>(null);
  // Vídeo con el aviso de borrado abierto — el borrado se lleva también el archivo.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { show, snackbar } = useSnackbar();

  const fileInputRef = useRef<HTMLInputElement>(null);

  function videoUrl(v: VideoRecord): string {
    return pbFileUrl(COLLECTION_VIDEOS, v.id, v.file);
  }

  function handleVideoLoadedMetadata(id: string, e: React.SyntheticEvent<HTMLVideoElement>) {
    const dur = e.currentTarget.duration;
    if (isFinite(dur) && dur > 0) {
      setDurations((prev) => ({ ...prev, [id]: dur }));
    }
    setVideoLoaded((prev) => ({ ...prev, [id]: true }));
    setVideoErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleVideoError(v: VideoRecord) {
    const ext = v.file.split(".").pop()?.toLowerCase() ?? "";
    const msg = POTENTIALLY_UNSUPPORTED.includes(ext)
      ? `Formato .${ext} no reproducible en Chrome/Firefox. Convierte a MP4 H.264.`
      : "No se pudo cargar el vídeo.";
    setVideoErrors((prev) => ({ ...prev, [v.id]: msg }));
    setVideoLoaded((prev) => ({ ...prev, [v.id]: false }));
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
    const items: UploadItem[] = selected.map((f, i) => ({
      file: f,
      label: displayName(slug, startIdx + i),
      status: "waiting" as const,
      progress: 0,
    }));

    setUploadItems(items);
    setAllDone(false);
    await runUpload(items);
  }

  async function runUpload(items: UploadItem[]) {
    setUploading(true);
    let current = [...localVideos];

    for (let i = 0; i < items.length; i++) {
      setUploadItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "uploading", progress: 0 } : it))
      );
      const item = items[i];
      const order = current.length + 1;
      const ext = item.file.name.split(".").pop()?.toLowerCase() ?? "mp4";
      const name = displayName(slug, order);
      const renamed = new File([item.file], `${slug}_${order}.${ext}`, {
        type: normalizeVideoType(item.file),
      });
      try {
        // Un record por vídeo: si falla uno, los anteriores ya quedaron guardados.
        const created = await createWithProgress<VideoRecord>(
          COLLECTION_VIDEOS,
          { course: courseId, name, order },
          renamed,
          (pct) => {
            setUploadItems((prev) =>
              prev.map((it, idx) => (idx === i ? { ...it, progress: pct } : it))
            );
          }
        );
        current = [...current, created];
        setLocalVideos(current);
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

    setUploading(false);
    setAllDone(true);
  }

  /** Guarda order + name de los vídeos cuya posición cambió. */
  async function persistOrder(updated: VideoRecord[], before: VideoRecord[]) {
    const pb = getPocketBase();
    const prevById = new Map(before.map((v) => [v.id, v]));
    const changed = updated.filter((v) => {
      const p = prevById.get(v.id);
      return !p || p.order !== v.order || p.name !== v.name;
    });
    await Promise.all(
      changed.map((v) =>
        pb.collection(COLLECTION_VIDEOS).update(v.id, { order: v.order, name: v.name })
      )
    );
  }

  function renumber(list: VideoRecord[]): VideoRecord[] {
    return list.map((v, i) => ({ ...v, order: i + 1, name: displayName(slug, i + 1) }));
  }

  async function moveVideo(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= localVideos.length) return;
    const prev = localVideos;
    const swapped = [...localVideos];
    [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
    // Reordenar y recalcular display names según nueva posición
    const reordered = renumber(swapped);
    setLocalVideos(reordered);
    try {
      await persistOrder(reordered, prev);
    } catch (err: unknown) {
      setLocalVideos(prev);
      show(`Error al reordenar: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  }

  async function deleteVideo(video: VideoRecord) {
    setPendingDelete(null);
    const prev = localVideos;
    const updated = renumber(localVideos.filter((v) => v.id !== video.id));
    setLocalVideos(updated);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_VIDEOS).delete(video.id); // borra también el archivo
      await persistOrder(updated, prev);
      show("Vídeo eliminado");
    } catch (err: unknown) {
      setLocalVideos(prev);
      show(`No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`, "error");
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
                  {item.label}
                  <span className="text-grisclarito"> · {formatBytes(item.file.size)}</span>
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
          const dur = durations[v.id];
          const err = videoErrors[v.id];
          const loaded = videoLoaded[v.id];
          const ext = v.file.split(".").pop()?.toLowerCase() ?? "";
          const isUnsupportedExt = POTENTIALLY_UNSUPPORTED.includes(ext);

          return (
            <div key={v.id} className="bg-blanco shadow-sm px-4 py-3 flex items-center gap-3">
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
                    src={videoUrl(v)}
                    className="w-24 h-14 object-cover bg-grisoscuro rounded-sm"
                    preload="metadata"
                    playsInline
                    muted
                    onLoadedMetadata={(e) => handleVideoLoadedMetadata(v.id, e)}
                    onError={() => handleVideoError(v)}
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
                  <p className="text-[11px] text-ambar font-semibold mt-0.5">
                    ⚠ .{ext} solo en Safari. Convierte a MP4 H.264.
                  </p>
                )}
              </div>

              {/* Controles orden / borrar */}
              {pendingDelete === v.id ? (
                /* Borrar un vídeo se lleva también el archivo: nunca con un solo toque. */
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[11px] text-rojo font-semibold leading-tight text-right">
                    ¿Borrar?<br /><span className="text-grisclarito font-normal">no se deshace</span>
                  </span>
                  <button onClick={() => deleteVideo(v)}
                    className="text-xs font-bold text-blanco bg-rojo px-2 h-7 flex items-center justify-center rounded-sm hover:opacity-85 transition-opacity">
                    Sí
                  </button>
                  <button onClick={() => setPendingDelete(null)}
                    className="text-xs font-bold text-marron border border-marron px-2 h-7 flex items-center justify-center rounded-sm hover:bg-marron hover:text-blanco transition-colors">
                    No
                  </button>
                </div>
              ) : (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => moveVideo(idx, -1)} disabled={idx === 0}
                    className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    ↑
                  </button>
                  <button onClick={() => moveVideo(idx, 1)} disabled={idx === localVideos.length - 1}
                    className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    ↓
                  </button>
                  <button onClick={() => setPendingDelete(v.id)} title="Eliminar el vídeo"
                    className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-rojo hover:text-rojo transition-colors">
                    ×
                  </button>
                </div>
              )}
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
                {playingVideo.name || displayName(slug, localVideos.findIndex(v => v.id === playingVideo.id) + 1)}
              </p>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-grisoscuro hover:text-blanco text-xl transition-colors"
              >
                ×
              </button>
            </div>
            <video
              key={playingVideo.id}
              src={videoUrl(playingVideo)}
              controls
              autoPlay
              playsInline
              className="w-full aspect-video bg-negro block rounded-sm"
            />
          </div>
        </div>
      )}

      {snackbar}
    </section>
  );
}
