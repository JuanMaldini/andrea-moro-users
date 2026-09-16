"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { seekVideoPreview, videoPreviewSrc } from "@/lib/video-preview";

interface Props {
  src: string;
  title: string;

}

export interface CoursePlayerHandle { play: () => void; }

const ERROR_MSGS: Record<number, string> = {
  2: "Error de red al cargar el vídeo. Comprueba tu conexión.",
  3: "No se pudo decodificar el vídeo. Si vuelve a ocurrir, avisanos qué lección estás viendo.",
  4: "Este vídeo no está disponible o el formato no es soportado por tu navegador.",
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Reproductor minimal con controles propios: play/pausa, barra de progreso,
 * tiempo y pantalla completa. Al terminar queda pausado.
 */
const CoursePlayer = forwardRef<CoursePlayerHandle, Props>(function CoursePlayer({ src, title }, ref) {
  const videoRef = useRef<FullscreenVideo>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nativeControls, setNativeControls] = useState(false);
  const attemptRef = useRef(0);
  const requestedRef = useRef(false);

  // Preserve the media element across lessons, and reset before a new play request.
  useLayoutEffect(() => {
    attemptRef.current++;
    requestedRef.current = false;
    setBuffering(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setError(null);
  }, [src]);

  useEffect(() => () => { attemptRef.current++; }, []);

  useEffect(() => {
    if (!buffering) return;
    const timeout = setTimeout(() => {
      setError("El vídeo está tardando en responder. Podés reintentar o usar los controles del navegador.");
      setBuffering(false);
    }, 15000);
    return () => clearTimeout(timeout);
  }, [buffering]);

  function play() {
    const v = videoRef.current;
    if (!v) return;
    const attempt = ++attemptRef.current;
    requestedRef.current = true;
    setError(null);
    setBuffering(true);
    if (v.error) v.load();
    // Safari: play must happen inside the tap, before any await, effect or timer.
    const failed = (reason: unknown) => {
      if (attempt !== attemptRef.current) return;
      requestedRef.current = false;
      setPlaying(false);
      setBuffering(false);
      const name = reason instanceof Error ? reason.name : "UnknownError";
      if (name === "AbortError") return;
      setError(name === "NotAllowedError"
        ? "El navegador bloqueó el inicio del vídeo. Tocá Reproducir para intentarlo de nuevo o usá los controles del navegador."
        : ERROR_MSGS[v.error?.code ?? 0] ?? "No se pudo iniciar el vídeo. Reintentá o usá los controles del navegador.");
      console.warn("Video playback failed", { name, code: v.error?.code, readyState: v.readyState, networkState: v.networkState });
    };
    try { v.play().catch(failed); } catch (reason) { failed(reason); }
  }

  useImperativeHandle(ref, () => ({ play }));

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else {
      attemptRef.current++;
      requestedRef.current = false;
      v.pause();
      setBuffering(false);
    }
  }

  function seek(value: number) {
    const v = videoRef.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = value;
    setCurrent(value);
  }

  function toggleFullscreen() {
    const v = videoRef.current;
    const wrap = wrapRef.current;
    if (!v || !wrap) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (wrap.requestFullscreen) {
      wrap.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    } else {
      // iPhone Safari: solo el <video> puede ir a pantalla completa.
      v.webkitEnterFullscreen?.();
    }
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div>
      <div ref={wrapRef} className="relative bg-negro group">
        <video
          ref={videoRef}
          src={videoPreviewSrc(src)}
          controls={nativeControls}
          playsInline
          preload="metadata"
          className="w-full aspect-video bg-negro block"
          onClick={nativeControls ? undefined : togglePlay}
          onPlay={() => { requestedRef.current = true; setError(null); }}
          onPause={() => { setPlaying(false); setBuffering(false); }}
          onEnded={() => { requestedRef.current = false; setPlaying(false); setBuffering(false); }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => { setPlaying(true); setBuffering(false); setError(null); }}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (!requestedRef.current) seekVideoPreview(e.currentTarget);
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onError={(e) => {
            const code = e.currentTarget.error?.code ?? 0;
            setError(ERROR_MSGS[code] ?? "No se pudo reproducir el vídeo.");
            setPlaying(false);
            setBuffering(false);
          }}
        />

        {/* Botón central de play cuando está pausado */}
        {!playing && !buffering && !nativeControls && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Reproducir"
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-marron/90 text-blanco text-xl flex items-center justify-center hover:bg-marroncalido transition-colors"
          >
            <span className="pl-1">▶</span>
          </button>
        )}

        {buffering && !nativeControls && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span role="status" aria-label="Cargando vídeo" className="w-8 h-8 border-2 border-blanco/40 border-t-blanco rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Barra de controles */}
      {!nativeControls && <div className="bg-blanco px-3 py-2 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pausar" : "Reproducir"}
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-marron hover:text-marroncalido transition-colors text-sm"
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Progreso"
          className="flex-1 min-w-0 h-1 cursor-pointer appearance-none bg-grisoscuro accent-marron"
          style={{
            background: `linear-gradient(to right, #a7856a ${pct}%, #e7e3e0 ${pct}%)`,
          }}
        />

        <span className="text-[11px] font-mono text-grisclarito flex-shrink-0 tabular-nums">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Pantalla completa"
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-marron hover:text-marroncalido transition-colors text-base"
        >
          ⛶
        </button>
      </div>}

      <p className="sr-only">{title}</p>

      {error && (
        <div role="alert" className="mt-3 px-4 py-3 bg-rojo/10 border border-rojo/40 text-rojo text-xs leading-relaxed rounded">
          ⚠ {error}
          <div className="mt-2 flex flex-wrap gap-4">
            <button type="button" className="underline" onClick={play}>Reintentar</button>
            {!nativeControls && <button type="button" className="underline" onClick={() => {
              if (videoRef.current) videoRef.current.controls = true;
              setNativeControls(true);
              play();
            }}>Usar controles del navegador</button>}
          </div>
        </div>
      )}
    </div>
  );
});

export default CoursePlayer;
