"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_MEDIA, pbFileUrl } from "@/lib/pocketbase-browser";
import { createWithProgress } from "@/lib/upload";
import { stripExtension, type MediaRecord } from "@/lib/course-utils";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useSnackbar } from "@/components/Snackbar";

interface Props {
  courseId: string;
  gallery: MediaRecord[];
}

export default function GalleryUploader({ courseId, gallery }: Props) {
  const [photos, setPhotos] = useState<MediaRecord[]>(gallery);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Foto con el aviso de borrado abierto — borrar un archivo no se puede deshacer.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { show, snackbar } = useSnackbar();

  function imgUrl(photo: MediaRecord) {
    return pbFileUrl(COLLECTION_MEDIA, photo.id, photo.file);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    e.target.value = "";
    setError("");
    setProgress(0);
    setUploading(true);

    let current = [...photos];
    try {
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        // Un record por foto: si hay error de red a mitad, las anteriores no se pierden.
        const created = await createWithProgress<MediaRecord>(
          COLLECTION_MEDIA,
          {
            course: courseId,
            kind: "gallery",
            name: stripExtension(file.name),
            original: file.name,
            order: current.length + 1,
          },
          file,
          (pct) => {
            // progreso global aproximado entre todas las fotos
            const base = Math.round((i / selected.length) * 100);
            setProgress(base + Math.round(pct / selected.length));
          }
        );
        current = [...current, created];
        setPhotos(current);
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir las fotos.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function deletePhoto(photo: MediaRecord) {
    setPendingDelete(null);
    const prev = photos;
    // Optimista: quita la foto de la UI al instante.
    setPhotos(photos.filter((p) => p.id !== photo.id));
    try {
      await getPocketBase().collection(COLLECTION_MEDIA).delete(photo.id);
      show("Foto eliminada");
    } catch {
      // Revierte si la red falló.
      setPhotos(prev);
      show("No se pudo eliminar la foto.", "error");
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Galería de fotos ({photos.length})
        </h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Subiendo..." : "+ Añadir fotos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
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

      {photos.length === 0 ? (
        <p className="text-xs text-grisclarito text-center py-6">
          Sin fotos. Añade las primeras arriba.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group aspect-square bg-grisoscuro overflow-hidden">
              <img
                src={imgUrl(photo)}
                alt={photo.file}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              {pendingDelete === photo.id ? (
                <ConfirmDelete
                  what="esta foto"
                  onConfirm={() => deletePhoto(photo)}
                  onCancel={() => setPendingDelete(null)}
                />
              ) : (
                /* Siempre visible: en móvil no hay hover y un botón invisible se toca sin querer. */
                <button
                  type="button"
                  onClick={() => setPendingDelete(photo.id)}
                  title="Eliminar la foto"
                  className="absolute top-1 right-1 bg-marron/85 text-blanco text-sm w-7 h-7 rounded-full flex items-center justify-center hover:bg-rojo transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {snackbar}
    </section>
  );
}
