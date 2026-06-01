"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";

interface Props {
  courseId: string;
  initialFiles: string[];
}

export default function GalleryUploader({ courseId, initialFiles }: Props) {
  const [files, setFiles] = useState<string[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "";

  function imgUrl(filename: string) {
    return `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    e.target.value = "";
    setUploading(true);
    const pb = getPocketBase();
    try {
      for (const f of selected) {
        const fd = new FormData();
        fd.append("gallery", f);
        const result = await pb.collection(COLLECTION_DATA).update<{ gallery: string[] }>(courseId, fd);
        setFiles(result.gallery ?? []);
      }
    } catch {
      alert("Error al subir las fotos.");
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(filename: string) {
    const pb = getPocketBase();
    try {
      const result = await pb.collection(COLLECTION_DATA).update<{ gallery: string[] }>(courseId, {
        "gallery-": [filename],
      });
      setFiles(result.gallery ?? []);
    } catch {
      alert("Error al eliminar la foto.");
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Galería de fotos ({files.length})
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

      {files.length === 0 ? (
        <p className="text-xs text-grisclarito text-center py-6">
          Sin fotos. Añade las primeras arriba.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {files.map((filename) => (
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
