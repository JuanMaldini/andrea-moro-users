"use client";

import { useEffect, useRef, useState } from "react";
import { getPocketBase, COLLECTION_MEDIA, pbFileUrl } from "@/lib/pocketbase-browser";
import { createWithProgress } from "@/lib/upload";
import { stripExtension, type MediaRecord } from "@/lib/course-utils";

type SiteKind = "site_gallery" | "site_andrea";

/* ─── Sub-sección ──────────────────────────────────────────────── */
interface SectionProps {
  title: string;
  items: MediaRecord[];
  uploading: boolean;
  progress: number;
  onUpload: (files: File[]) => void;
  onDelete: (item: MediaRecord) => void;
}

function GallerySection({
  title,
  items,
  uploading,
  progress,
  onUpload,
  onDelete,
}: SectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-marron">{title}</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs font-bold border-2 border-marron text-marron px-3 py-1.5 hover:bg-marron hover:text-blanco transition-all rounded disabled:opacity-40"
        >
          + Agregar fotos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              onUpload(Array.from(e.target.files));
              e.target.value = "";
            }
          }}
        />
      </div>

      {uploading && (
        <div className="mb-3 h-2 bg-grisclaro rounded-full overflow-hidden">
          <div
            className="h-full bg-marron transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-grisoscuro/60 py-4">Sin fotos aún.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {items.map((item) => (
            <div key={item.id} className="relative group aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pbFileUrl(COLLECTION_MEDIA, item.id, item.file)}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />

              {pendingDelete === item.id ? (
                /* Confirmación inline */
                <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2 p-2">
                  <p className="text-white text-xs font-semibold text-center leading-tight">
                    ¿Eliminar<br/>esta foto?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { onDelete(item); setPendingDelete(null); }}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded"
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(null)}
                      className="px-3 py-1 bg-white/80 hover:bg-white text-black text-xs font-bold rounded"
                    >
                      No
                    </button>
                  </div>
                </div>
              ) : (
                /* Botón X — siempre visible, más grande */
                <button
                  type="button"
                  onClick={() => setPendingDelete(item.id)}
                  title="Eliminar"
                  className="absolute top-1 right-1 w-8 h-8 bg-red-500/75 hover:bg-red-600 text-white text-xl font-bold rounded-full flex items-center justify-center shadow transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Componente principal ─────────────────────────────────────── */
export default function SiteGalleryManager() {
  const [galleryItems, setGalleryItems] = useState<MediaRecord[]>([]);
  const [andreaItems, setAndreaItems] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [andreaUploading, setAndreaUploading] = useState(false);
  const [andreaProgress, setAndreaProgress] = useState(0);

  /* Fetch al montar */
  useEffect(() => {
    const pb = getPocketBase();

    async function init() {
      try {
        const all = await pb.collection(COLLECTION_MEDIA).getFullList<MediaRecord>({
          filter: 'kind = "site_gallery" || kind = "site_andrea"',
          sort: "order,created",
        });
        setGalleryItems(all.filter((m) => m.kind === "site_gallery"));
        setAndreaItems(all.filter((m) => m.kind === "site_andrea"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error cargando galerías");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  /* Upload genérico: un record por foto */
  async function handleUpload(
    kind: SiteKind,
    items: MediaRecord[],
    setItems: (r: MediaRecord[]) => void,
    setUploading: (b: boolean) => void,
    setProgress: (n: number) => void,
    files: File[]
  ) {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    let current = [...items];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const created = await createWithProgress<MediaRecord>(
          COLLECTION_MEDIA,
          {
            kind,
            name: stripExtension(file.name),
            original: file.name,
            order: current.length + 1,
          },
          file,
          (pct) => {
            const base = Math.round((i / files.length) * 100);
            setProgress(base + Math.round(pct / files.length));
          }
        );
        current = [...current, created];
        setItems(current);
      }
    } catch (e) {
      console.error("[SiteGalleryManager] upload error:", e);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /* Delete genérico */
  async function handleDelete(
    items: MediaRecord[],
    setItems: (r: MediaRecord[]) => void,
    item: MediaRecord
  ) {
    const pb = getPocketBase();
    try {
      await pb.collection(COLLECTION_MEDIA).delete(item.id);
      setItems(items.filter((m) => m.id !== item.id));
    } catch (e) {
      console.error("[SiteGalleryManager] delete error:", e);
    }
  }

  /* ─── Render ─── */
  return (
    <div className="px-4 pb-16 md:px-6 mt-12 border-t-2 border-marron/20 pt-10">
      <h1 className="text-xl font-bold text-marron mb-1">Galerías del sitio</h1>
      <p className="text-xs text-gray-700 mb-2">
        Se muestran en la página principal de andreamorotienda.com
      </p>

      {loading && (
        <p className="text-sm text-marron/60 py-6">Cargando…</p>
      )}

      {error && (
        <p className="text-sm text-red-500 py-4">{error}</p>
      )}

      {!loading && !error && (
        <>
          <GallerySection
            title="Galería"
            items={galleryItems}
            uploading={galleryUploading}
            progress={galleryProgress}
            onUpload={(files) =>
              handleUpload(
                "site_gallery",
                galleryItems,
                setGalleryItems,
                setGalleryUploading,
                setGalleryProgress,
                files
              )
            }
            onDelete={(item) => handleDelete(galleryItems, setGalleryItems, item)}
          />

          <GallerySection
            title="Andrea en Acción"
            items={andreaItems}
            uploading={andreaUploading}
            progress={andreaProgress}
            onUpload={(files) =>
              handleUpload(
                "site_andrea",
                andreaItems,
                setAndreaItems,
                setAndreaUploading,
                setAndreaProgress,
                files
              )
            }
            onDelete={(item) => handleDelete(andreaItems, setAndreaItems, item)}
          />
        </>
      )}
    </div>
  );
}
