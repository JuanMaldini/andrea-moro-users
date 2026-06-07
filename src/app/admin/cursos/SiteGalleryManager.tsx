"use client";

import { useEffect, useRef, useState } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { uploadWithProgress } from "@/lib/upload";

const PB_URL = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

function fileUrl(recordId: string, filename: string): string {
  return `${PB_URL}/api/files/${COLLECTION_DATA}/${recordId}/${filename}`;
}

interface SiteRecord {
  id: string;
  files: string[];
  json: { type?: string };
}

/* ─── Sub-sección ──────────────────────────────────────────────── */
interface SectionProps {
  title: string;
  record: SiteRecord | null;
  uploading: boolean;
  progress: number;
  onUpload: (files: File[]) => void;
  onDelete: (filename: string) => void;
}

function GallerySection({
  title,
  record,
  uploading,
  progress,
  onUpload,
  onDelete,
}: SectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const files = record?.files ?? [];

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-marron">{title}</h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !record}
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

      {files.length === 0 ? (
        <p className="text-sm text-grisoscuro/60 py-4">Sin fotos aún.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {files.map((filename) => (
            <div key={filename} className="relative group aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(record!.id, filename)}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />

              {pendingDelete === filename ? (
                /* Confirmación inline */
                <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-2 p-2">
                  <p className="text-white text-xs font-semibold text-center leading-tight">
                    ¿Eliminar<br/>esta foto?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { onDelete(filename); setPendingDelete(null); }}
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
                  onClick={() => setPendingDelete(filename)}
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
  const [galleryRecord, setGalleryRecord] = useState<SiteRecord | null>(null);
  const [andreaRecord, setAndreaRecord] = useState<SiteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryProgress, setGalleryProgress] = useState(0);
  const [andreaUploading, setAndreaUploading] = useState(false);
  const [andreaProgress, setAndreaProgress] = useState(0);

  /* Fetch / crear records al montar */
  useEffect(() => {
    const pb = getPocketBase();

    async function init() {
      try {
        const all = await pb
          .collection(COLLECTION_DATA)
          .getFullList<SiteRecord>({ perPage: 200 });

        let galleryRec =
          all.find((r) => r.json?.type === "gallery") ?? null;
        let andreaRec =
          all.find((r) => r.json?.type === "andrea") ?? null;

        if (!galleryRec) {
          galleryRec = await pb
            .collection(COLLECTION_DATA)
            .create<SiteRecord>({ title: "__gallery__", json: { type: "gallery" } });
        }
        if (!andreaRec) {
          andreaRec = await pb
            .collection(COLLECTION_DATA)
            .create<SiteRecord>({ title: "__andrea__", json: { type: "andrea" } });
        }

        setGalleryRecord(galleryRec);
        setAndreaRecord(andreaRec);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error cargando galerías");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  /* Upload genérico */
  async function handleUpload(
    record: SiteRecord,
    setRecord: (r: SiteRecord) => void,
    setUploading: (b: boolean) => void,
    setProgress: (n: number) => void,
    files: File[]
  ) {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    try {
      const updated = await uploadWithProgress<SiteRecord>(
        record.id,
        "files",
        files,
        setProgress
      );
      setRecord(updated);
    } catch (e) {
      console.error("[SiteGalleryManager] upload error:", e);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /* Delete genérico */
  async function handleDelete(
    record: SiteRecord,
    setRecord: (r: SiteRecord) => void,
    filename: string
  ) {
    const pb = getPocketBase();
    try {
      const updated = await pb
        .collection(COLLECTION_DATA)
        .update<SiteRecord>(record.id, { "files-": [filename] });
      setRecord(updated);
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
            record={galleryRecord}
            uploading={galleryUploading}
            progress={galleryProgress}
            onUpload={(files) =>
              galleryRecord &&
              handleUpload(
                galleryRecord,
                setGalleryRecord,
                setGalleryUploading,
                setGalleryProgress,
                files
              )
            }
            onDelete={(filename) =>
              galleryRecord &&
              handleDelete(galleryRecord, setGalleryRecord, filename)
            }
          />

          <GallerySection
            title="Andrea en Acción"
            record={andreaRecord}
            uploading={andreaUploading}
            progress={andreaProgress}
            onUpload={(files) =>
              andreaRecord &&
              handleUpload(
                andreaRecord,
                setAndreaRecord,
                setAndreaUploading,
                setAndreaProgress,
                files
              )
            }
            onDelete={(filename) =>
              andreaRecord &&
              handleDelete(andreaRecord, setAndreaRecord, filename)
            }
          />
        </>
      )}
    </div>
  );
}
     