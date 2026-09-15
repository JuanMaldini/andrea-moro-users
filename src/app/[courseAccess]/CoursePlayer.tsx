"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  title: string;
  /** true cuando el cambio de vídeo lo pidió la alumna (click en la lista) → reproduce. */
  autoPlay: boolean;
}

const ERROR_MSGS: Record<number, string> = {
  2: "Error de red al cargar el vídeo. Comprueba tu conexión.",
  3: "El navegador no puede decodificar este vídeo. Puede que esté en formato H.265/HEVC (iPhone). Prueba con Safari o convierte el vídeo.",
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
export default function CoursePlayer({ src, title, autoPlay }: Props) {
  const videoRef = useRef<FullscreenVideo>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nuevo vídeo → reinicia estado.
  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setError(null);
  }, [src]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => {});
    else v.pause();
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
          key={src}
          src={src}
          autoPlay={autoPlay}
          playsInline
          preload="metadata"
          className="w-full aspect-video bg-negro block"
          onClick={togglePlay}
          onPlay={() => { setPlaying(true); setError(null); }}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
          onError={(e) => {
            const code = e.currentTarget.error?.code ?? 0;
            setError(ERROR_MSGS[code] ?? "No se pudo reproducir el vídeo.");
            setPlaying(false);
          }}
        />

        {/* Botón central de play cuando está pausado */}
        {!playing && !error && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Reproducir"
            className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-marron/90 text-blanco text-xl flex items-center justify-center hover:bg-marroncalido transition-colors"
          >
            <span className="pl-1">▶</span>
          </button>
        )}

        {buffering && playing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-8 h-8 border-2 border-blanco/40 border-t-blanco rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Barra de controles */}
      <div className="bg-blanco px-3 py-2 flex items-center gap-3">
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
      </div>

      <p className="sr-only">{title}</p>

      {error && (
        <div className="mt-3 px-4 py-3 bg-rojo/10 border border-rojo/40 text-rojo text-xs leading-relaxed rounded">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
