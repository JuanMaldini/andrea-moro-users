"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { COURSE_PASSWORD } from "@/lib/auth";
import {
  type CourseRecord,
  type CourseVideo,
} from "@/lib/course-utils";
import VideoUploader from "./VideoUploader";
import GalleryUploader from "./GalleryUploader";

interface Props {
  course: CourseRecord;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

type SaveStatus = "idle" | "saving" | "saved";

export default function CursoEditor({ course }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [price, setPrice] = useState<number>(course.price ?? 0);
  const [slug, setSlug] = useState(course.json?.slug ?? course.id);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [passCopied, setPassCopied] = useState(false);

  // Videos
  const [videos, setVideos] = useState<CourseVideo[]>(course.json?.videos ?? []);

  // Gallery
  const [gallery, setGallery] = useState<string[]>(course.json?.gallery ?? []);

  // Delete course
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs for debounced save
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  const priceRef = useRef(price);
  const slugRef = useRef(slug);
  const videosRef = useRef<CourseVideo[]>(videos);
  const galleryRef = useRef<string[]>(gallery);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Save ────────────────────────────────────────────────────────────────

  async function doSave() {
    setSaveStatus("saving");
    try {
      const pb = getPocketBase();
      const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(course.id);
      await pb.collection(COLLECTION_DATA).update(course.id, {
        title: titleRef.current.trim(),
        description: descriptionRef.current,
        price: priceRef.current,
        json: {
          ...latest.json,
          published: true,
          slug: slugRef.current,
          videos: videosRef.current,
          gallery: galleryRef.current,
        },
      });
      setSaveStatus("saved");
      router.refresh();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("idle");
    }
  }

  function scheduleSave(delay = 700) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, delay);
  }

  function handleTitleChange(val: string) {
    const newSlug = slugify(val);
    setTitle(val); titleRef.current = val;
    setSlug(newSlug); slugRef.current = newSlug;
    scheduleSave();
  }

  function handleDescriptionChange(val: string) {
    setDescription(val); descriptionRef.current = val;
    scheduleSave();
  }

  function handlePriceChange(val: string) {
    const n = parseInt(val, 10);
    const safe = isNaN(n) ? 0 : Math.max(0, n);
    setPrice(safe); priceRef.current = safe;
    scheduleSave();
  }

  function handleCopyPass() {
    navigator.clipboard.writeText(COURSE_PASSWORD).then(() => {
      setPassCopied(true);
      setTimeout(() => setPassCopied(false), 1500);
    });
  }

  // ── Videos callback ──────────────────────────────────────────────────────

  function handleVideosChange(newVideos: CourseVideo[]) {
    setVideos(newVideos);
    videosRef.current = newVideos;
  }

  function handleGalleryChange(newGallery: string[]) {
    setGallery(newGallery);
    galleryRef.current = newGallery;
  }

  // ── Delete course ────────────────────────────────────────────────────────

  async function handleDeleteCourse() {
    setDeleting(true);
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).delete(course.id);
      router.push("/admin/cursos");
      router.refresh();
    } catch {
      alert("Error al eliminar el curso.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const statusLabel =
    saveStatus === "saving" ? "Guardando..." :
    saveStatus === "saved"  ? "Guardado" : null;

  return (
    <div className="space-y-12">

      {/* === Información === */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-marron">Información</h2>
          {statusLabel && <span className="text-sm font-semibold text-marron">{statusLabel}</span>}
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">Título</label>
            <input type="text" value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleTitleChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all" />
            {slug && (
              <p className="text-sm text-marron font-mono font-semibold mt-2">
                /{slug}_<span className="text-grisclaro bg-marron px-1 rounded">xxxxxxxx</span>
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">Descripción</label>
            <textarea value={description} rows={4}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleDescriptionChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all resize-none" />
          </div>

          {/* Precio + Clave de acceso (lado a lado) */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">Precio (ARS$)</label>
              <input
                type="number"
                min={0}
                step={100}
                value={price}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePriceChange(e.target.value)}
                className="w-48 px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">Clave de acceso</label>
              <div className="w-48 px-4 py-3 border-2 border-marron bg-vanilla flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-negro text-base">{COURSE_PASSWORD}</span>
                <button
                  type="button"
                  onClick={handleCopyPass}
                  className="text-xs font-semibold text-blanco bg-marron border-2 border-marron px-2 py-1 hover:bg-marroncalido hover:border-marroncalido transition-all rounded flex-shrink-0"
                >
                  {passCopied ? "✓" : "Copiar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === Vídeos === */}
      <VideoUploader
        courseId={course.id}
        slug={slugRef.current}
        videos={videos}
        onVideosChange={handleVideosChange}
      />

      {/* === Galería === */}
      <GalleryUploader
        courseId={course.id}
        course={course}
        gallery={gallery}
        onGalleryChange={handleGalleryChange}
      />

      {/* === Zona peligrosa === */}
      <section className="border-t-2 border-grisoscuro pt-10">
        <h2 className="text-sm font-bold uppercase tracking-widest text-rojo mb-5">Zona peligrosa</h2>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="text-xs font-bold border-2 border-rojo text-rojo px-6 py-3 hover:bg-rojo hover:text-blanco transition-all rounded">
            Eliminar este curso
          </button>
        ) : (
          <div className="bg-rojo/10 border-2 border-rojo px-6 py-5 rounded">
            <p className="text-base font-bold text-marron mb-2">¿Seguro que quieres eliminar este curso?</p>
            <p className="text-sm text-marron mb-5 font-semibold">Se elimina todo. Irreversible.</p>
            <div className="flex gap-3">
              <button onClick={handleDeleteCourse} disabled={deleting}
                className="text-xs font-bold bg-rojo text-blanco px-6 py-2 hover:opacity-80 transition-opacity disabled:opacity-50 rounded">
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="text-xs font-bold border-2 border-marron text-marron px-6 py-2 hover:bg-marron hover:text-blanco transition-all rounded">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
