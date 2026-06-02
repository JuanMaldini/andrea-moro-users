"use client";

/**
 * VideoDebugPanel — panel de diagnóstico para problemas de carga/reproducción de vídeos.
 *
 * Comprueba para cada vídeo:
 *  1. Soporte de codecs del navegador actual
 *  2. Accesibilidad HTTP de la URL (con y sin token)
 *  3. Eventos del elemento <video> (loadstart, loadedmetadata, error…)
 *  4. Content-Type real servido por PocketBase
 *
 * Úsalo cuando los vídeos no muestran miniatura o no se reproducen.
 * Añade <VideoDebugPanel> dentro del CursoEditor para activarlo.
 */

import { useState, useEffect } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import type { CourseVideo, CourseRecord, CourseJson } from "@/lib/course-utils";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface VideoStatus {
  file: string;
  urlPublic: string;
  urlWithToken: string;
  http: { status: number | null; error?: string; contentType?: string; sizeKB?: string };
  httpNoAuth: { status: number | null; error?: string };
  canPlayResult: string;
  events: string[];
  duration?: number;
  resolution?: string;
  loading: boolean;
}

interface Props {
  courseId: string;
  videos: CourseVideo[];
  pbUrl: string;
  onVideosRepaired?: (fixed: CourseVideo[]) => void;
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const CODEC_TESTS: Record<string, string> = {
  "H.264 / MP4 (estándar web)": 'video/mp4; codecs="avc1.42E01E"',
  "H.265 / HEVC (iPhone por defecto)": 'video/mp4; codecs="hvc1"',
  "QuickTime / MOV (iPhone)": "video/quicktime",
  "WebM VP8": 'video/webm; codecs="vp8"',
  "WebM VP9": 'video/webm; codecs="vp9"',
  "AVI": "video/x-msvideo",
};

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
  wmv: "video/x-ms-wmv",
};

const ERROR_CODES: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED — el usuario canceló la carga",
  2: "MEDIA_ERR_NETWORK — error de red al descargar",
  3: "MEDIA_ERR_DECODE — el navegador no puede decodificar el codec (ej: HEVC en Chrome)",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED — URL inaccesible o formato no soportado",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDur(s: number): string {
  if (!isFinite(s) || s <= 0) return "?";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function statusColor(s: number | null): string {
  if (s === null) return "text-grisclarito";
  if (s >= 200 && s < 300) return "text-green-600";
  if (s === 401 || s === 403) return "text-yellow-600";
  return "text-red-500";
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function VideoDebugPanel({ courseId, videos, pbUrl, onVideosRepaired }: Props) {
  const [open, setOpen] = useState(false);
  const [statuses, setStatuses] = useState<VideoStatus[]>([]);
  const [codecSupport, setCodecSupport] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);

  useEffect(() => {
    setUserAgent(navigator.userAgent);
    const v = document.createElement("video");
    const result: Record<string, string> = {};
    for (const [label, mime] of Object.entries(CODEC_TESTS)) {
      result[label] = v.canPlayType(mime) || "no";
    }
    setCodecSupport(result);
  }, []);

  function buildUrl(filename: string, withToken: boolean): string {
    const base = `${pbUrl.replace(/\/$/, "")}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
    if (!withToken) return base;
    try {
      const token = getPocketBase().authStore.token;
      if (token) return `${base}?token=${encodeURIComponent(token)}`;
    } catch { /* ignorar */ }
    return base;
  }

  function updateStatus(idx: number, patch: Partial<VideoStatus>) {
    setStatuses((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function runDiagnostics() {
    if (running) return;
    setRunning(true);

    // Inicializar estado
    const initial: VideoStatus[] = videos.map((v) => ({
      file: v.file,
      urlPublic: buildUrl(v.file, false),
      urlWithToken: buildUrl(v.file, true),
      http: { status: null },
      httpNoAuth: { status: null },
      canPlayResult: "",
      events: [],
      loading: true,
    }));
    setStatuses(initial);

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const urlWithToken = buildUrl(video.file, true);
      const urlPublic = buildUrl(video.file, false);

      // 1. Prueba HTTP con token (como el admin)
      let httpStatus: number | null = null;
      let httpError: string | undefined;
      let contentType: string | undefined;
      let sizeKB: string | undefined;
      try {
        const res = await fetch(urlWithToken, { method: "HEAD" });
        httpStatus = res.status;
        contentType = res.headers.get("content-type") ?? undefined;
        const cl = res.headers.get("content-length");
        if (cl) sizeKB = `${(parseInt(cl) / 1024).toFixed(0)} KB`;
      } catch (err) {
        httpError = err instanceof Error ? err.message : String(err);
      }

      // 2. Prueba HTTP sin token (como lo ven los alumnos)
      let httpNoAuthStatus: number | null = null;
      let httpNoAuthError: string | undefined;
      try {
        const res = await fetch(urlPublic, { method: "HEAD" });
        httpNoAuthStatus = res.status;
      } catch (err) {
        httpNoAuthError = err instanceof Error ? err.message : String(err);
      }

      updateStatus(i, {
        http: { status: httpStatus, error: httpError, contentType, sizeKB },
        httpNoAuth: { status: httpNoAuthStatus, error: httpNoAuthError },
      });

      // 3. canPlayType por extensión
      const ext = video.file.split(".").pop()?.toLowerCase() ?? "";
      const mime = EXT_MIME[ext] ?? "video/mp4";
      const testEl = document.createElement("video");
      const canPlay = testEl.canPlayType(mime) || "no";
      const canPlayResult = `.${ext} (${mime}) → "${canPlay}"`;
      updateStatus(i, { canPlayResult });

      // 4. Cargar metadatos con elemento <video>
      const events: string[] = [];
      await new Promise<void>((resolve) => {
        const el = document.createElement("video");
        el.preload = "metadata";
        el.muted = true;
        el.crossOrigin = "anonymous";
        el.src = urlWithToken;

        const timer = setTimeout(() => {
          events.push("⏱ timeout — sin respuesta en 10 segundos");
          updateStatus(i, { events: [...events], loading: false });
          resolve();
        }, 10_000);

        el.addEventListener("loadstart", () => {
          events.push("loadstart ✓ — el navegador inició la petición");
          updateStatus(i, { events: [...events] });
        });
        el.addEventListener("loadedmetadata", () => {
          const dur = isFinite(el.duration) ? el.duration : 0;
          const res = el.videoWidth && el.videoHeight ? `${el.videoWidth}×${el.videoHeight}` : "desconocida";
          events.push(`loadedmetadata ✓ — duración: ${formatDur(dur)}, resolución: ${res}`);
          updateStatus(i, {
            events: [...events],
            duration: dur,
            resolution: res,
            loading: false,
          });
          clearTimeout(timer);
          resolve();
        });
        el.addEventListener("stalled", () => {
          events.push("⚠ stalled — descarga pausada (red lenta o servidor sin soporte de range requests)");
          updateStatus(i, { events: [...events] });
        });
        el.addEventListener("suspend", () => {
          events.push("suspend — el navegador pausó la descarga (normal si obtuvo metadata)");
          updateStatus(i, { events: [...events] });
        });
        el.addEventListener("waiting", () => {
          events.push("waiting — esperando datos...");
          updateStatus(i, { events: [...events] });
        });
        el.addEventListener("error", () => {
          const err = el.error;
          const code = err?.code ?? 0;
          const explanation = ERROR_CODES[code] ?? `código desconocido: ${code}`;
          const nativeMsg = err?.message ? ` | mensaje nativo: "${err.message}"` : "";
          events.push(`✗ error — ${explanation}${nativeMsg}`);
          updateStatus(i, { events: [...events], loading: false });
          clearTimeout(timer);
          resolve();
        });
      });
    }

    setRunning(false);
  }

  /**
   * Reparación automática de nombres rotos.
   *
   * El bug: al subir un vídeo, PocketBase puede renombrar el archivo
   * (añade sufijo aleatorio). El código anterior guardaba el nombre
   * original en json.videos en lugar del nombre real que PocketBase asignó.
   * Resultado: los videos muestran 404 porque el filename en json.videos
   * no coincide con el archivo real en el campo `files` del record.
   *
   * Este proceso:
   * 1. Lee el record real de PocketBase (campo `files` con todos los archivos)
   * 2. Detecta qué entradas de json.videos dan 404
   * 3. Intenta emparejar cada entrada rota con un archivo real del campo `files`
   *    usando el número de orden como heurística (begonias_1 → primer mp4, etc.)
   * 4. Guarda json.videos corregido
   */
  async function repairVideoNames() {
    setRepairing(true);
    setRepairResult(null);
    try {
      const pb = getPocketBase();
      const record = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
      const allFiles: string[] = record.files ?? [];

      // Separar los archivos reales en vídeos e imágenes por extensión
      const videoExts = new Set(["mp4", "m4v", "mov", "avi", "webm", "mkv", "ogv", "wmv"]);
      const realVideos = allFiles.filter((f) => {
        const ext = f.split(".").pop()?.toLowerCase() ?? "";
        return videoExts.has(ext);
      });

      if (realVideos.length === 0) {
        setRepairResult("No se encontraron archivos de vídeo en el campo `files` del record. Puede que los vídeos no se subieron correctamente.");
        setRepairing(false);
        return;
      }

      // Detectar cuáles entradas de json.videos dan 404
      const currentVideos: CourseVideo[] = record.json?.videos ?? [];
      const brokenIndices: number[] = [];
      for (let i = 0; i < currentVideos.length; i++) {
        const url = buildUrl(currentVideos[i].file, true);
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.status === 404) brokenIndices.push(i);
        } catch {
          brokenIndices.push(i);
        }
      }

      if (brokenIndices.length === 0) {
        setRepairResult("✓ Todos los vídeos están bien. No hay nada que reparar.");
        setRepairing(false);
        return;
      }

      // Emparejar vídeos rotos con archivos reales.
      // Heurística: el orden en `realVideos` suele coincidir con el orden de subida.
      // Los vídeos OK se excluyen de la lista de candidatos.
      const okFiles = new Set(
        currentVideos
          .filter((_, i) => !brokenIndices.includes(i))
          .map((v) => v.file)
      );
      const candidates = realVideos.filter((f) => !okFiles.has(f));

      const fixed = [...currentVideos];
      let matched = 0;
      for (let j = 0; j < brokenIndices.length; j++) {
        const idx = brokenIndices[j];
        const candidate = candidates[j];
        if (candidate) {
          fixed[idx] = { ...fixed[idx], file: candidate, name: candidate };
          matched++;
        }
      }

      if (matched === 0) {
        setRepairResult(
          `Hay ${brokenIndices.length} vídeo(s) con 404 pero no se pudieron emparejar con archivos reales.\n` +
          `Archivos reales en PocketBase: ${realVideos.join(", ")}\n` +
          `Borra los vídeos rotos desde la lista y vuélvelos a subir.`
        );
        setRepairing(false);
        return;
      }

      // Guardar json corregido
      const updatedJson: CourseJson = { ...record.json, videos: fixed };
      await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });

      onVideosRepaired?.(fixed);
      setRepairResult(
        `✓ Reparados ${matched} de ${brokenIndices.length} vídeo(s).\n` +
        `Archivos corregidos: ${brokenIndices.map((i) => `${currentVideos[i].file} → ${fixed[i].file}`).join(", ")}\n` +
        `Recarga la página para ver los cambios.`
      );
    } catch (err) {
      setRepairResult(`Error durante la reparación: ${err instanceof Error ? err.message : String(err)}`);
    }
    setRepairing(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-grisclarito underline underline-offset-2 hover:text-marron transition-colors"
      >
        🔍 Diagnóstico de vídeos
      </button>
    );
  }

  return (
    <div className="border border-grisoscuro bg-blanco text-xs font-mono">

      {/* Cabecera */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-grisoscuro bg-vanilla">
        <span className="font-bold text-marron">🔍 Diagnóstico de vídeos</span>
        <button onClick={() => setOpen(false)} className="text-grisclarito hover:text-marron text-base">✕</button>
      </div>

      <div className="p-4 space-y-6">

        {/* Soporte de codecs */}
        <div>
          <p className="font-bold text-marron mb-2">Soporte de codecs en este navegador</p>
          <p className="text-grisclarito mb-2 break-all">{userAgent}</p>
          <div className="space-y-1">
            {Object.entries(codecSupport).map(([label, support]) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className={
                  support === "probably" ? "text-green-600" :
                  support === "maybe"    ? "text-yellow-600" : "text-red-500"
                }>
                  {support === "probably" ? "✓" : support === "maybe" ? "~" : "✗"}
                </span>
                <span className="text-marroncalido">{label}:</span>
                <span className="text-negro">{support || "no"}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800">
            <p className="font-bold mb-1">⚠ Problema común con iPhone:</p>
            <p>iPhone graba en H.265/HEVC por defecto. Chrome y Firefox NO soportan H.265.</p>
            <p className="mt-1">Solución: en iPhone → Ajustes → Cámara → Formato → selecciona <strong>Más compatible</strong> (H.264/MP4). O sube los vídeos desde un Mac con iMovie exportado como H.264.</p>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={runDiagnostics}
            disabled={running || repairing || videos.length === 0}
            className="text-xs border border-marron text-marron px-4 py-2 hover:bg-marron hover:text-blanco transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "⏳ Analizando..." : `▶ Ejecutar diagnóstico (${videos.length} vídeo${videos.length !== 1 ? "s" : ""})`}
          </button>

          {/* Reparación automática — útil cuando hay 404 por nombres mal guardados */}
          <button
            onClick={repairVideoNames}
            disabled={running || repairing || videos.length === 0}
            className="text-xs border border-yellow-600 text-yellow-700 px-4 py-2 hover:bg-yellow-600 hover:text-blanco transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {repairing ? "⏳ Reparando..." : "🔧 Reparar nombres (404)"}
          </button>
        </div>

        {repairResult && (
          <div className={`p-3 border text-xs whitespace-pre-wrap ${
            repairResult.startsWith("✓")
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-yellow-50 border-yellow-200 text-yellow-800"
          }`}>
            {repairResult}
          </div>
        )}

        {videos.length === 0 && (
          <p className="text-grisclarito">No hay vídeos subidos aún.</p>
        )}

        {/* Resultados por vídeo */}
        {statuses.map((s, i) => (
          <div key={s.file} className="border border-grisoscuro">
            {/* Cabecera vídeo */}
            <div className="px-3 py-2 bg-grisoscuro/20 border-b border-grisoscuro">
              <span className="font-bold text-marron">#{i + 1} </span>
              <span className="text-negro">{s.file}</span>
              {s.loading && <span className="ml-2 text-grisclarito animate-pulse">cargando...</span>}
              {s.duration !== undefined && (
                <span className="ml-2 text-green-600">✓ {formatDur(s.duration)}</span>
              )}
            </div>

            <div className="p-3 space-y-2">

              {/* URLs */}
              <div>
                <span className="text-grisclarito">URL pública: </span>
                <span className="text-negro break-all">{s.urlPublic}</span>
              </div>

              {/* HTTP con token (admin) */}
              <div>
                <span className="text-grisclarito">HTTP (con token admin): </span>
                {s.http.status !== null ? (
                  <span className={statusColor(s.http.status)}>
                    {s.http.status}
                    {s.http.status === 200 && " ✓ accesible"}
                    {s.http.status === 401 && " ✗ requiere autenticación"}
                    {s.http.status === 403 && " ✗ acceso prohibido"}
                    {s.http.status === 404 && " ✗ archivo no encontrado"}
                  </span>
                ) : (
                  <span className="text-grisclarito">{s.http.error ?? "pendiente"}</span>
                )}
                {s.http.contentType && (
                  <span className="text-grisclarito ml-2">| Content-Type: <span className="text-negro">{s.http.contentType}</span></span>
                )}
                {s.http.sizeKB && (
                  <span className="text-grisclarito ml-2">| Tamaño: <span className="text-negro">{s.http.sizeKB}</span></span>
                )}
              </div>

              {/* HTTP sin token (alumnos) */}
              <div>
                <span className="text-grisclarito">HTTP (sin token / alumnas): </span>
                {s.httpNoAuth.status !== null ? (
                  <span className={statusColor(s.httpNoAuth.status)}>
                    {s.httpNoAuth.status}
                    {s.httpNoAuth.status === 200 && " ✓ accesible sin login"}
                    {s.httpNoAuth.status === 401 && " ✗ requiere login (las alumnas no podrán ver los vídeos)"}
                    {s.httpNoAuth.status === 403 && " ✗ prohibido sin login"}
                  </span>
                ) : (
                  <span className="text-grisclarito">{s.httpNoAuth.error ?? "pendiente"}</span>
                )}
              </div>

              {/* canPlayType */}
              {s.canPlayResult && (
                <div>
                  <span className="text-grisclarito">canPlayType: </span>
                  <span className={
                    s.canPlayResult.includes('"probably"') ? "text-green-600" :
                    s.canPlayResult.includes('"maybe"')   ? "text-yellow-600" : "text-red-500"
                  }>
                    {s.canPlayResult}
                  </span>
                </div>
              )}

              {/* Resolución */}
              {s.resolution && (
                <div>
                  <span className="text-grisclarito">Resolución: </span>
                  <span className="text-negro">{s.resolution}</span>
                </div>
              )}

              {/* Eventos del elemento video */}
              {s.events.length > 0 && (
                <div>
                  <p className="text-grisclarito mb-1">Eventos del elemento &lt;video&gt;:</p>
                  <div className="bg-negro/5 p-2 space-y-0.5">
                    {s.events.map((ev, j) => (
                      <p key={j} className={
                        ev.includes("✗") || ev.includes("error") ? "text-red-500" :
                        ev.includes("✓") ? "text-green-600" :
                        ev.includes("⚠") || ev.includes("⏱") ? "text-yellow-600" :
                        "text-grisclarito"
                      }>
                        {ev}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Interpretación rápida */}
              {!s.loading && s.events.length > 0 && (() => {
                const hasError = s.events.some(e => e.includes("✗"));
                const hasMetadata = s.events.some(e => e.includes("loadedmetadata"));
                const isHevc = s.events.some(e => e.includes("DECODE"));
                const noAccess = s.http.status !== 200;

                if (hasMetadata) return (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 text-green-700">
                    ✓ Vídeo cargado correctamente. Si no se ve en el editor, puede ser un problema de CORS o de la UI.
                  </div>
                );
                if (noAccess) return (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700">
                    ✗ URL no accesible (HTTP {s.http.status}). Comprueba las reglas de la colección en PocketBase.
                  </div>
                );
                if (isHevc) return (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 text-yellow-800">
                    ✗ Error de decodificación — probablemente H.265/HEVC. Este codec no está soportado en Chrome ni Firefox. Convierte el vídeo a H.264/MP4.
                  </div>
                );
                if (hasError) return (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 text-red-700">
                    ✗ Error al cargar. Revisa los eventos de arriba para más detalles.
                  </div>
                );
                return null;
              })()}

            </div>
          </div>
        ))}

        {/* Guía rápida */}
        <div className="border border-grisoscuro p-3 space-y-2 text-grisclarito">
          <p className="font-bold text-marroncalido">Guía de diagnóstico:</p>
          <p><span className="text-red-500">MEDIA_ERR_DECODE</span> → codec no soportado (normalmente H.265/HEVC de iPhone). Convierte a H.264.</p>
          <p><span className="text-red-500">MEDIA_ERR_SRC_NOT_SUPPORTED</span> → URL inaccesible (401/403) o formato completamente desconocido.</p>
          <p><span className="text-red-500">MEDIA_ERR_NETWORK</span> → problema de red o CORS. Comprueba que PocketBase tiene CORS configurado para este dominio.</p>
          <p><span className="text-yellow-600">stalled</span> → la descarga se paró. Puede ser red lenta o que el servidor no soporta range requests.</p>
          <p><span className="text-yellow-600">HTTP 401 sin token</span> → los ficheros requieren autenticación. Las alumnas no pueden verlos. Abre PocketBase → colección andreamoro_data → API Rules → View rule → déjala vacía para acceso público.</p>
        </div>

      </div>
    </div>
  );
}
