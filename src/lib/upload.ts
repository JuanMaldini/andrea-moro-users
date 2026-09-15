/**
 * upload.ts — subida de archivos a PocketBase con barra de progreso real.
 *
 * El SDK de PocketBase no expone el progreso de subida, así que usamos
 * XMLHttpRequest directamente y leemos `xhr.upload.onprogress`.
 *
 * Cada archivo se sube como un RECORD NUEVO (POST) en su colección
 * (andreamoro_videos / andreamoro_media): no hay PATCH concurrentes sobre un
 * mismo record ni diff de nombres de archivo.
 *
 * Robustez para móviles (iPhone con vídeos pesados):
 *  - valida el tamaño antes de empezar
 *  - pide Wake Lock para que la pantalla no se bloquee (iOS corta la subida)
 *  - reintenta 1 vez si la conexión se corta
 *  - mensajes de error concretos
 */
"use client";

import { getPocketBase } from "./pocketbase-browser";
import { PB_URL } from "./collections";

/** Debe coincidir con el maxSize del campo `file` en PocketBase. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

class NetworkError extends Error {}

type WakeLockSentinelLike = { release: () => Promise<void> };

async function acquireWakeLock(): Promise<WakeLockSentinelLike | null> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    return (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    return null; // no soportado o denegado: la subida sigue igual
  }
}

function sendOnce<T>(
  url: string,
  fd: FormData,
  token: string,
  onProgress?: (pct: number) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 0; // sin límite: un vídeo grande por datos móviles tarda

    // PocketBase acepta el token directamente en el header Authorization.
    if (token) xhr.setRequestHeader("Authorization", token);

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          /* sin cuerpo */
        }
        resolve(parsed as T);
        return;
      }

      if (xhr.status === 413) {
        reject(new Error("El archivo supera el límite de tamaño del servidor."));
        return;
      }
      if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error("Sesión expirada o sin permisos. Recarga la página e inicia sesión de nuevo."));
        return;
      }

      let body: unknown = xhr.responseText;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* respuesta no-JSON */
      }
      const data = (body as { data?: Record<string, { code?: string; message?: string }> })?.data;
      const top = (body as { message?: string })?.message ?? `Error ${xhr.status}`;
      const fieldErr = data
        ? Object.entries(data)
            .map(([c, d]) => `${c}: ${d?.message ?? d?.code}`)
            .join(" · ")
        : "";
      const msg = fieldErr ? `${top} (${fieldErr})` : `${top} [${xhr.status}]`;
      console.error(`[upload] ${msg}`, body);
      reject(new Error(msg));
    };

    xhr.onerror = () => reject(new NetworkError("network"));
    xhr.onabort = () => reject(new NetworkError("abort"));
    xhr.send(fd);
  });
}

/**
 * Crea un record en `collection` con `fields` + el archivo en el campo `file`,
 * reportando el progreso (0–100). Devuelve el record creado.
 */
export async function createWithProgress<T = Record<string, unknown>>(
  collection: string,
  fields: Record<string, string | number>,
  file: File,
  onProgress?: (pct: number) => void
): Promise<T> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `El archivo pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(MAX_UPLOAD_BYTES)}.`
    );
  }

  const pb = getPocketBase();
  if (!pb.authStore.isValid) {
    throw new Error("Sesión expirada. Recarga la página e inicia sesión de nuevo.");
  }

  const url = `${PB_URL}/api/collections/${collection}/records`;
  const build = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
    fd.append("file", file);
    return fd;
  };

  const wakeLock = await acquireWakeLock();
  try {
    try {
      return await sendOnce<T>(url, build(), pb.authStore.token, onProgress);
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      // Un corte puntual de red: reintenta una vez desde cero.
      onProgress?.(0);
      try {
        return await sendOnce<T>(url, build(), pb.authStore.token, onProgress);
      } catch (err2) {
        if (!(err2 instanceof NetworkError)) throw err2;
        throw new Error(
          `Se cortó la conexión al subir el archivo (${formatBytes(file.size)}). ` +
            "Mantén la pantalla encendida y esta pestaña abierta, usa Wi-Fi y vuelve a intentarlo."
        );
      }
    }
  } finally {
    wakeLock?.release().catch(() => {});
  }
}
