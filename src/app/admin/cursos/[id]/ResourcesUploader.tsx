"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { uploadWithProgress } from "@/lib/upload";
import {
  resourceKind,
  stripExtension,
  type CourseRecord,
  type CourseJson,
  type CourseResource,
} from "@/lib/course-utils";

interface Props {
  courseId: string;
  course: CourseRecord;
  resources: CourseResource[];
  onResourcesChange: (resources: CourseResource[]) => void;
}

export default function ResourcesUploader({
  courseId, course, resources, onResourcesChange,
}: Props) {
  const [items, setItems] = useState<CourseResource[]>(resources);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lista de TODOS los archivos del record (vídeos + fotos + recursos). Sirve para
  // hacer el diff y saber el nombre real con el que PocketBase guardó cada recurso.
  const knownFiles = useRef<string[]>(course.files ?? []);
  // Debounce para guardar los nombres de display mientras se escriben.
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pbUrl = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

  function fileUrl(filename: string) {
    return `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
  }

  function commit(updated: CourseResource[]) {
    setItems(updated);
    onResourcesChange(updated);
  }

  async function persistResources(updated: CourseResource[]) {
    const pb = getPocketBase();
    // Lee el json más reciente para no pisar cambios de vídeos/galería hechos en
    // la misma sesión, y mezcla solo la parte de resources.
    const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
    const updatedJson: CourseJson = { ...latest.json, resources: updated };
    await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;

    // Por ahora solo imágenes y vídeos. El `accept` del input no es garantía
    // (se puede elegir "todos los archivos" en el diálogo), así que se filtra aquí.
    const selected = picked.filter((f) => {
      const kind = resourceKind(f.name);
      return kind === "image" || kind === "video";
    });
    const rejected = picked.filter((f) => !selected.includes(f));
    if (rejected.length) {
      setError(
        `No admitido por ahora (solo imágenes y vídeos): ${rejected.map((f) => f.name).join(", ")}`
      );
    }
    if (!selected.length) return;

    if (!rejected.length) setError("");
    setProgress(0);
    setUploading(true);

    let current = [...items];
    try {
      // Refresca el baseline con TODOS los archivos actuales del record antes de
      // empezar. Sin esto, si en la misma sesión se subió un vídeo o una foto
      // después de montar el componente, el diff lo tomaría como "archivo nuevo"
      // y se colaría en la lista de recursos.
      try {
        const pb = getPocketBase();
        const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
        knownFiles.current = latest.files ?? knownFiles.current;
      } catch {
        /* si falla, seguimos con el baseline que teníamos */
      }

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        // Sube al campo único `files` (files+ → no pisa vídeos ni fotos).
        const result = await uploadWithProgress<{ files: string[] }>(
          courseId,
          "files",
          [file],
          (pct) => {
            // progreso global aproximado entre todos los recursos
            const base = Math.round((i / selected.length) * 100);
            setProgress(base + Math.round(pct / selected.length));
          }
        );
        const all = result.files ?? [];
        // El nombre real del recurso recién subido = el archivo nuevo en `files`.
        const added = all.filter((f) => !knownFiles.current.includes(f));
        knownFiles.current = all;

        const newOnes: CourseResource[] = added.map((filename, k) => ({
          file: filename,
          name: stripExtension(file.name),
          original: file.name,
          order: current.length + k + 1,
        }));
        current = [...current, ...newOnes];
        commit(current);
        // Guarda tras cada archivo: si hay error de red a mitad, los anteriores no se pierden.
        await persistResources(current);
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir los recursos.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleNameChange(filename: string, value: string) {
    const updated = items.map((r) => (r.file === filename ? { ...r, name: value } : r));
    commit(updated);
    if (nameTimer.current) clearTimeout(nameTimer.current);
    nameTimer.current = setTimeout(() => {
      persistResources(updated).catch(() => setError("No se pudo guardar el nombre."));
    }, 700);
  }

  async function deleteResource(filename: string) {
    const prev = items;
    const updated = items
      .filter((r) => r.file !== filename)
      .map((r, i) => ({ ...r, order: i + 1 }));
    // Optimista: quita el recurso de la UI al instante.
    commit(updated);
    knownFiles.current = knownFiles.current.filter((f) => f !== filename);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(courseId, { "files-": [filename] });
      await persistResources(updated);
    } catch {
      // Revierte si la red falló.
      knownFiles.current = [...knownFiles.current, filename];
      commit(prev);
      alert("Error al eliminar el recurso.");
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Recursos ({items.length})
        </h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Subiendo..." : "+ Añadir recursos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Barra de progreso minimal */}
      {uploading && (
        <div className="mb-4">
          <div className="h-1 w-full bg-grisoscuro overflow-hidden">
            <div
              className="h-full bg-marron transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-grisclarito mt-1 text-right font-mono">{progress}%</p>
        </div>
      )}

      {error && <p className="text-rojo text-xs mb-3 break-words">{error}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-grisclarito text-center py-6">
          Sin recursos. Añade imágenes o vídeos arriba.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((r) => {
            const kind = resourceKind(r.file);
            const ext = r.file.split(".").pop()?.toLowerCase() ?? "";

            return (
              <div key={r.file}>
                <div className="relative group aspect-square bg-grisoscuro overflow-hidden">
                  {kind === "image" ? (
                    <img
                      src={fileUrl(r.file)}
                      alt={r.name}
                      className="w-full h-full object-cover"
                    />
                  ) : kind === "video" ? (
                    <video
                      src={fileUrl(r.file)}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      playsInline
                      muted
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <span className="text-2xl">{kind === "pdf" ? "📄" : "📎"}</span>
                      <span className="text-[9px] text-grisclarito uppercase">.{ext}</span>
                    </div>
                  )}
                  <button
                    onClick={() => deleteResource(r.file)}
                    className="absolute top-1 right-1 bg-marron text-blanco text-xs w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rojo"
                  >
                    ×
                  </button>
                </div>

                {/* Nombre de display editable + nombre original */}
                <input
                  type="text"
                  value={r.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNameChange(r.file, e.target.value)
                  }
                  className="w-full mt-1 px-1.5 py-1 border border-grisoscuro bg-blanco text-xs text-marroncalido focus:outline-none focus:border-marron transition-colors"
                />
                <p className="text-[10px] text-grisclarito truncate mt-0.5" title={r.original}>
                  {r.original}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
