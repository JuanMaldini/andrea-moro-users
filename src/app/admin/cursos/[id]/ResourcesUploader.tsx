"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_MEDIA, pbFileUrl } from "@/lib/pocketbase-browser";
import { createWithProgress } from "@/lib/upload";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useSnackbar } from "@/components/Snackbar";
import VideoThumbnail from "@/components/VideoThumbnail";
import {
  resourceKind,
  stripExtension,
  type MediaRecord,
} from "@/lib/course-utils";

interface Props {
  courseId: string;
  resources: MediaRecord[];
}

export default function ResourcesUploader({ courseId, resources }: Props) {
  const [items, setItems] = useState<MediaRecord[]>(resources);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Recurso con el aviso de borrado abierto — borrar un archivo no se puede deshacer.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { show, snackbar } = useSnackbar();

  // Debounce para guardar los nombres de display mientras se escriben.
  const nameTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function fileUrl(r: MediaRecord) {
    return pbFileUrl(COLLECTION_MEDIA, r.id, r.file);
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
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        // Un record por recurso: si hay error de red a mitad, los anteriores no se pierden.
        const created = await createWithProgress<MediaRecord>(
          COLLECTION_MEDIA,
          {
            course: courseId,
            kind: "resource",
            name: stripExtension(file.name),
            original: file.name,
            order: current.length + 1,
          },
          file,
          (pct) => {
            // progreso global aproximado entre todos los recursos
            const base = Math.round((i / selected.length) * 100);
            setProgress(base + Math.round(pct / selected.length));
          }
        );
        current = [...current, created];
        setItems(current);
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir los recursos.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleNameChange(id: string, value: string) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, name: value } : r)));
    if (nameTimers.current[id]) clearTimeout(nameTimers.current[id]);
    nameTimers.current[id] = setTimeout(() => {
      getPocketBase()
        .collection(COLLECTION_MEDIA)
        .update(id, { name: value })
        .catch(() => setError("No se pudo guardar el nombre."));
    }, 700);
  }

  async function deleteResource(resource: MediaRecord) {
    setPendingDelete(null);
    const prev = items;
    const updated = items
      .filter((r) => r.id !== resource.id)
      .map((r, i) => ({ ...r, order: i + 1 }));
    // Optimista: quita el recurso de la UI al instante.
    setItems(updated);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_MEDIA).delete(resource.id);
      const prevOrder = new Map(prev.map((r) => [r.id, r.order]));
      await Promise.all(
        updated
          .filter((r) => prevOrder.get(r.id) !== r.order)
          .map((r) => pb.collection(COLLECTION_MEDIA).update(r.id, { order: r.order }))
      );
      show("Recurso eliminado");
    } catch {
      // Revierte si la red falló.
      setItems(prev);
      show("No se pudo eliminar el recurso.", "error");
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
              <div key={r.id}>
                <div className="relative group aspect-square bg-grisoscuro overflow-hidden">
                  {kind === "image" ? (
                    <img
                      src={fileUrl(r)}
                      alt={r.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : kind === "video" ? (
                    <VideoThumbnail
                      src={fileUrl(r)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <span className="text-2xl">{kind === "pdf" ? "📄" : "📎"}</span>
                      <span className="text-[9px] text-grisclarito uppercase">.{ext}</span>
                    </div>
                  )}
                  {pendingDelete === r.id ? (
                    <ConfirmDelete
                      what={r.name || "este recurso"}
                      onConfirm={() => deleteResource(r)}
                      onCancel={() => setPendingDelete(null)}
                    />
                  ) : (
                    /* Siempre visible: en móvil no hay hover y un botón invisible se toca sin querer. */
                    <button
                      type="button"
                      onClick={() => setPendingDelete(r.id)}
                      title="Eliminar el recurso"
                      className="absolute top-1 right-1 bg-marron/85 text-blanco text-sm w-7 h-7 rounded-full flex items-center justify-center hover:bg-rojo transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Nombre de display editable + nombre original */}
                <input
                  type="text"
                  value={r.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleNameChange(r.id, e.target.value)
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

      {snackbar}
    </section>
  );
}
