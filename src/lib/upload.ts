/**
 * upload.ts — subida de archivos a PocketBase con barra de progreso real.
 *
 * El SDK de PocketBase no expone el progreso de subida, así que usamos
 * XMLHttpRequest directamente contra la API de records y leemos
 * `xhr.upload.onprogress` para reportar el porcentaje.
 *
 * Importante: usamos el modificador `+` en el nombre del campo (ej. "gallery+",
 * "files+") para AÑADIR archivos sin borrar los que ya había.
 */
"use client";

import { getPocketBase, COLLECTION_DATA } from "./pocketbase-browser";

const PB_URL = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

/**
 * Sube uno o varios archivos a un campo de archivos de un record y reporta
 * el progreso de carga (0–100). Devuelve el record actualizado.
 *
 * @param recordId   id del curso (record en andreamoro_data)
 * @param field      nombre del campo SIN modificador (ej. "gallery" | "files")
 * @param files      archivos a subir
 * @param onProgress callback con el % de bytes subidos (0–100)
 */
export function uploadWithProgress<T = Record<string, unknown>>(
  recordId: string,
  field: string,
  files: File[],
  onProgress?: (pct: number) => void
): Promise<T> {
  const pb = getPocketBase();
  const url = `${PB_URL}/api/collections/${COLLECTION_DATA}/records/${recordId}`;

  const fd = new FormData();
  // `+` → modo "append": no reemplaza los archivos existentes del campo.
  for (const f of files) fd.append(`${field}+`, f);

  const token = pb.authStore.token;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", url);

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
      } else {
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
      }
    };

    xhr.onerror = () => reject(new Error("Error de red al subir el archivo."));
    xhr.send(fd);
  });
}
