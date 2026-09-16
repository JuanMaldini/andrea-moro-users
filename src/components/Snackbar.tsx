"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SnackTone = "info" | "error";

interface Snack {
  id: number;
  message: string;
  tone: SnackTone;
}

const AUTO_HIDE_MS = 3200;

/**
 * Aviso flotante abajo de la pantalla. Reemplaza a `alert()`: no bloquea,
 * se lee igual en móvil y desaparece solo.
 *
 * Uso:
 *   const { show, snackbar } = useSnackbar();
 *   show("Foto eliminada");
 *   return <>{…} {snackbar}</>;
 */
export function useSnackbar() {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, tone: SnackTone = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSnack({ id: Date.now(), message, tone });
    timerRef.current = setTimeout(() => setSnack(null), AUTO_HIDE_MS);
  }, []);

  // Si el componente se desmonta antes de que el aviso se cierre solo.
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const snackbar = snack ? (
    <div
      key={snack.id}
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] px-4 py-2.5 rounded shadow-lg text-sm font-semibold text-blanco pointer-events-none"
      style={{ backgroundColor: snack.tone === "error" ? "#ff0000" : "#a7856a" }}
    >
      {snack.message}
    </div>
  ) : null;

  return { show, snackbar };
}
