"use client";

import { useEffect, useRef, useState } from "react";
import { getPocketBase, COLLECTION_MEDIA, pbFileUrl } from "@/lib/pocketbase-browser";
import { createWithProgress } from "@/lib/upload";
import { stripExtension, type MediaRecord } from "@/lib/course-utils";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useSnackbar } from "@/components/Snackbar";

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
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                draggable={false}
              />

              {pendingDelete === item.id ? (
                <ConfirmDelete
                  what="esta foto"
                  onConfirm={() => { onDelete(item); setPendingDelete(null); }}
                  onCancel={() => setPendingDelete(null)}
                />
              ) : (
                /* Botón X — siempre visible: en móvil no hay hover */
                <button
                  type="button"
                  onClick={() => setPendingDelete(item.id)}
                  title="Eliminar la foto"
                  className="absolute top-1 right-1 w-7 h-7 bg-marron/85 hover:bg-rojo text-blanco text-sm rounded-full flex items-center justify-center shadow transition-colors"
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
  const { show, snackbar } = useSnackbar();

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
      show("No se pudieron subir todas las fotos.", "error");
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
      show("Foto eliminada");
    } catch (e) {
      console.error("[SiteGalleryManager] delete error:", e);
      show("No se pudo eliminar la foto.", "error");
    }
  }

  /* ─── Render ─── */
  return (
    <div className="px-4 pb-16 md:px-6 mt-12 border-t-2 border-marron/20 pt-10">
      <h1 className="text-xl font-bold text-marron mb-1">Galerías del sitio</h1>
      <p className="text-xs text-grisclarito mb-2">
        Se muestran en la página principal de andreamorotienda.com
      </p>

      {loading && (
        <p className="text-sm text-marron/60 py-6">Cargando…</p>
      )}

      {error && (
        <p className="text-sm text-rojo py-4">{error}</p>
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

      {snackbar}
    </div>
  );
}
