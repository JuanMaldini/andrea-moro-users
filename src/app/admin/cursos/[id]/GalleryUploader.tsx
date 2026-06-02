"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { uploadWithProgress } from "@/lib/upload";
import type { CourseRecord, CourseJson } from "@/lib/course-utils";

interface Props {
  courseId: string;
  course: CourseRecord;
  gallery: string[];
  onGalleryChange: (gallery: string[]) => void;
}

export default function GalleryUploader({ courseId, course, gallery, onGalleryChange }: Props) {
  const [photos, setPhotos] = useState<string[]>(gallery);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lista de TODOS los archivos del record (vídeos + fotos). Sirve para hacer
  // el diff y saber el nombre real con el que PocketBase guardó cada foto nueva.
  const knownFiles = useRef<string[]>(course.files ?? []);

  const pbUrl = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

  function imgUrl(filename: string) {
    return `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
  }

  function commit(updated: string[]) {
    setPhotos(updated);
    onGalleryChange(updated);
  }

  async function persistGallery(updated: string[]) {
    const pb = getPocketBase();
    // Lee el json más reciente para no pisar cambios de vídeos/keys hechos en
    // la misma sesión, y mezcla solo la parte de gallery.
    const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
    const updatedJson: CourseJson = { ...latest.json, gallery: updated };
    await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
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
        // Sube al campo único `files` (files+ → no pisa vídeos ni otras fotos).
        const result = await uploadWithProgress<{ files: string[] }>(
          courseId,
          "files",
          [file],
          (pct) => {
            // progreso global aproximado entre todas las fotos
            const base = Math.round((i / selected.length) * 100);
            setProgress(base + Math.round(pct / selected.length));
          }
        );
        const all = result.files ?? [];
        // El nombre real de la foto recién subida = el archivo nuevo en `files`.
        const added = all.filter((f) => !knownFiles.current.includes(f));
        knownFiles.current = all;
        current = [...current, ...added];
        commit(current);
        // Guarda tras cada foto: si hay error de red a mitad, las anteriores no se pierden.
        await persistGallery(current);
      }
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir las fotos.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function deletePhoto(filename: string) {
    const prev = photos;
    const updated = photos.filter((f) => f !== filename);
    // Optimista: quita la foto de la UI al instante.
    commit(updated);
    knownFiles.current = knownFiles.current.filter((f) => f !== filename);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(courseId, { "files-": [filename] });
      await persistGallery(updated);
    } catch {
      // Revierte si la red falló.
      knownFiles.current = [...knownFiles.current, filename];
      commit(prev);
      alert("Error al eliminar la foto.");
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
          {photos.map((filename) => (
            <div key={filename} className="relative group aspect-square bg-grisoscuro overflow-hidden">
              <img
                src={imgUrl(filename)}
                alt={filename}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => deletePhoto(filename)}
                className="absolute top-1 right-1 bg-marron text-blanco text-xs w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rojo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
