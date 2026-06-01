"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import {
  type CourseRecord,
  type CourseJson,
  type CourseVideo,
  buildCourseUrl,
} from "@/lib/course-utils";
import VideoUploader from "./VideoUploader";
import GalleryUploader from "./GalleryUploader";

interface Props {
  course: CourseRecord;
  host: string;
  collectionName: string;
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

export default function CursoEditor({ course, host }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [published, setPublished] = useState(course.json?.published ?? false);
  const [slug, setSlug] = useState(course.json?.slug ?? course.id);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // Keys: plain email strings
  const [keys, setKeys] = useState<string[]>((course.json?.keys ?? []) as string[]);
  const [newEmail, setNewEmail] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [keyError, setKeyError] = useState("");

  // Videos
  const [videos, setVideos] = useState<CourseVideo[]>(course.json?.videos ?? []);

  // Gallery (nombres de archivo dentro de `files` que son fotos)
  const [gallery, setGallery] = useState<string[]>(course.json?.gallery ?? []);

  // Delete course
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs for debounced save
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  const publishedRef = useRef(published);
  const slugRef = useRef(slug);
  const keysRef = useRef<string[]>(keys);
  const videosRef = useRef<CourseVideo[]>(videos);
  const galleryRef = useRef<string[]>(gallery);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const courseToken = course.json?.token ?? "";
  const courseUrl = slug && courseToken ? `${host}${buildCourseUrl(slug, courseToken)}` : "";

  // ── Save ────────────────────────────────────────────────────────────────

  async function doSave() {
    setSaveStatus("saving");
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(course.id, {
        title: titleRef.current.trim(),
        description: descriptionRef.current,
        json: {
          ...course.json,
          published: publishedRef.current,
          slug: slugRef.current,
          token: courseToken,
          keys: keysRef.current,
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

  function handlePublishedChange(val: boolean) {
    setPublished(val); publishedRef.current = val;
    scheduleSave(0);
  }

  // ── Keys (plain emails) ──────────────────────────────────────────────────

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError("");
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (keys.includes(trimmed)) { setKeyError("Ya existe."); return; }
    setAddingKey(true);
    const updated = [...keys, trimmed];
    keysRef.current = updated;
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(course.id, {
        json: { ...course.json, token: courseToken, slug: slugRef.current, keys: updated, videos: videosRef.current, gallery: galleryRef.current },
      });
      setKeys(updated);
      setNewEmail("");
    } catch {
      setKeyError("Error al guardar.");
    } finally {
      setAddingKey(false);
    }
  }

  async function handleDeleteKey(email: string) {
    const updated = keys.filter((k) => k !== email);
    keysRef.current = updated;
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(course.id, {
        json: { ...course.json, token: courseToken, slug: slugRef.current, keys: updated, videos: videosRef.current, gallery: galleryRef.current },
      });
      setKeys(updated);
    } catch {
      alert("Error al eliminar.");
    }
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

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
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
          <div className="flex items-center gap-3">
            <input id="published" type="checkbox" checked={published}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePublishedChange(e.target.checked)}
              className="w-5 h-5 accent-marron cursor-pointer" />
            <label htmlFor="published" className="text-sm font-semibold text-marron cursor-pointer">Publicado</label>
          </div>
        </div>
      </section>

      {/* === URL del curso === */}
      {courseUrl && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-marron mb-4">URL del curso</h2>
          <div className="bg-grisclaro border-2 border-marron px-5 py-4 flex items-center justify-between gap-4 rounded">
            <p className="text-sm text-marron font-mono font-semibold truncate">{courseUrl}</p>
            <button
              onClick={() => copyToClipboard(courseUrl)}
              className="text-xs font-semibold text-blanco bg-marron border-2 border-marron px-4 py-2 hover:bg-marroncalido hover:border-marroncalido transition-all flex-shrink-0 rounded"
            >
              Copiar
            </button>
          </div>
          <p className="text-sm text-marron font-semibold mt-3">
            Esta URL es la misma para todas las alumnas. Cada una entra con su correo.
          </p>
        </section>
      )}

      {/* === Correos con acceso === */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-marron mb-5">
          Correos con acceso ({keys.length})
        </h2>
        <form onSubmit={handleAddKey} className="flex gap-3 mb-4">
          <input type="text" value={newEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
            required placeholder="alumna@correo.com"
            className="flex-1 px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all rounded" />
          <button type="submit" disabled={addingKey}
            className="px-6 py-3 bg-marron text-blanco text-xs font-bold uppercase tracking-widest hover:bg-marroncalido transition-all disabled:opacity-50 whitespace-nowrap rounded">
            {addingKey ? "Añadiendo..." : "+ Añadir"}
          </button>
        </form>
        {keyError && <p className="text-rojo text-sm font-semibold mb-3 bg-rojo/10 px-3 py-2 rounded border border-rojo">{keyError}</p>}
        <div className="space-y-2">
          {keys.map((email) => (
            <div key={email} className="bg-grisclaro border-2 border-marron px-5 py-3 flex items-center justify-between rounded">
              <span className="text-sm font-semibold text-marron">{email}</span>
              <button onClick={() => handleDeleteKey(email)}
                className="text-xs font-bold text-blanco bg-rojo px-3 py-1 hover:opacity-80 transition-opacity rounded">
                ✕
              </button>
            </div>
          ))}
          {keys.length === 0 && (
            <p className="text-sm text-marron text-center py-6 bg-grisclaro rounded border-2 border-grisoscuro">Sin correos. Añade el primero.</p>
          )}
        </div>
      </section>

      {/* === Vídeos === */}
      <VideoUploader
        courseId={course.id}
        slug={slugRef.current}
        course={course}
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
