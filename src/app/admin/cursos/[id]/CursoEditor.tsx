"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import {
  type CourseRecord,
  type CourseKey,
  type CourseJson,
  generateToken,
  buildCourseUrl,
} from "@/lib/course-utils";

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

  // State (for rendering)
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [published, setPublished] = useState(course.json?.published ?? false);
  const [slug, setSlug] = useState(course.json?.slug ?? course.id);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [keys, setKeys] = useState<CourseKey[]>(course.json?.keys ?? []);
  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Refs — always current, used inside timers to avoid stale closures
  const titleRef = useRef(title);
  const descriptionRef = useRef(description);
  const publishedRef = useRef(published);
  const slugRef = useRef(slug);
  const keysRef = useRef(keys);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Core save ──────────────────────────────────────────────────────────────

  async function doSave() {
    setSaveStatus("saving");
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(course.id, {
        title: titleRef.current,
        description: descriptionRef.current,
        json: {
          ...course.json,
          published: publishedRef.current,
          slug: slugRef.current,
          keys: keysRef.current,
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

  // ── Meta handlers (auto-save) ──────────────────────────────────────────────

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
    scheduleSave(0); // immediate
  }

  // ── Keys persistence ───────────────────────────────────────────────────────

  async function persistKeys(updated: CourseKey[]) {
    keysRef.current = updated;
    const pb = getPocketBase();
    const updatedJson: CourseJson = {
      ...course.json,
      published: publishedRef.current,
      slug: slugRef.current,
      keys: updated,
    };
    await pb.collection(COLLECTION_DATA).update(course.id, { json: updatedJson });
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError("");
    const emailTrimmed = newEmail.trim();
    if (!emailTrimmed) return;
    if (keys.some((k: CourseKey) => k.email.toLowerCase() === emailTrimmed.toLowerCase())) {
      setKeyError("Ya existe una clave con ese valor.");
      return;
    }
    setAddingKey(true);
    const newKey: CourseKey = {
      email: emailTrimmed,
      token: generateToken(),
      label: newLabel.trim() || undefined,
      addedAt: new Date().toISOString(),
    };
    const updated = [...keys, newKey];
    try {
      await persistKeys(updated);
      setKeys(updated);
      setNewEmail("");
      setNewLabel("");
    } catch {
      setKeyError("Error al guardar la clave.");
    } finally {
      setAddingKey(false);
    }
  }

  async function handleSaveKeyEdit(token: string) {
    const trimmed = editingEmail.trim();
    if (!trimmed) return;
    const updated = keys.map((k: CourseKey) =>
      k.token === token ? { ...k, email: trimmed } : k
    );
    try {
      await persistKeys(updated);
      setKeys(updated);
      setEditingToken(null);
    } catch {
      alert("Error al guardar el cambio.");
    }
  }

  async function handleDeleteKey(token: string) {
    const updated = keys.filter((k: CourseKey) => k.token !== token);
    try {
      await persistKeys(updated);
      setKeys(updated);
    } catch {
      alert("Error al eliminar la clave.");
    }
  }

  // ── Delete course ──────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const statusLabel =
    saveStatus === "saving" ? "Guardando..." :
    saveStatus === "saved"  ? "Guardado" :
    null;

  return (
    <div className="space-y-10">

      {/* === Información === */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs uppercase tracking-widest text-marroncalido">
            Información
          </h2>
          {statusLabel && (
            <span className="text-xs text-grisclarito transition-opacity">
              {statusLabel}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-grisclarito mb-2">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleTitleChange(e.target.value)}
              className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            />
            {slug && (
              <p className="text-xs text-grisclarito mt-1 font-mono">
                /{slug}_<span className="text-marroncalido">xxxxxxxx</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-grisclarito mb-2">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleDescriptionChange(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="published"
              type="checkbox"
              checked={published}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePublishedChange(e.target.checked)}
              className="w-4 h-4 accent-marron"
            />
            <label htmlFor="published" className="text-xs text-marroncalido">
              Publicado
            </label>
          </div>
        </div>
      </section>

      {/* === Claves de acceso === */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-marroncalido mb-5">
          Claves de acceso ({keys.length})
        </h2>

        <form onSubmit={handleAddKey} className="bg-blanco shadow-sm px-5 py-4 mb-4">
          <p className="text-xs text-grisclarito mb-3">Añadir nueva clave</p>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={newEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
              required
              placeholder="correo o clave (ej: alumna@gmail.com)"
              className="flex-1 min-w-0 px-4 py-2 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
              placeholder="Etiqueta (opcional)"
              className="w-40 px-4 py-2 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            />
            <button
              type="submit"
              disabled={addingKey}
              className="px-5 py-2 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {addingKey ? "Añadiendo..." : "+ Añadir"}
            </button>
          </div>
          {keyError && <p className="text-rojo text-xs mt-2">{keyError}</p>}
        </form>

        <div className="space-y-2">
          {keys.map((k: CourseKey) => {
            const url = `${host}${buildCourseUrl(slug, k.token)}`;
            const isEditing = editingToken === k.token;

            return (
              <div key={k.token} className="bg-blanco shadow-sm px-5 py-4">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={editingEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingEmail(e.target.value)}
                      autoFocus
                      className="flex-1 min-w-0 px-3 py-1.5 border border-marron bg-vanilla text-sm focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveKeyEdit(k.token)}
                      className="text-xs text-blanco bg-marron px-3 py-1.5 hover:bg-marroncalido transition-colors"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingToken(null)}
                      className="text-xs text-grisclarito border border-grisoscuro px-3 py-1.5 hover:border-marron hover:text-marron transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-marron font-medium truncate">
                        {k.email}
                        {k.label && (
                          <span className="ml-2 text-xs text-grisclarito font-normal">
                            {k.label}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-grisclarito font-mono mt-0.5 truncate">
                        {url}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => { setEditingToken(k.token); setEditingEmail(k.email); }}
                        className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-marron hover:text-marron transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => copyToClipboard(url)}
                        className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-marron hover:text-marron transition-colors"
                      >
                        Copiar URL
                      </button>
                      <button
                        onClick={() => handleDeleteKey(k.token)}
                        className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-rojo hover:text-rojo transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {keys.length === 0 && (
            <p className="text-xs text-grisclarito text-center py-6">
              Sin claves. Añade la primera arriba.
            </p>
          )}
        </div>
      </section>

      {/* === Zona peligrosa === */}
      <section className="border-t border-grisoscuro pt-8">
        <h2 className="text-xs uppercase tracking-widest text-grisclarito mb-4">
          Zona peligrosa
        </h2>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs border border-grisoscuro text-grisclarito px-4 py-2 hover:border-rojo hover:text-rojo transition-colors"
          >
            Eliminar este curso
          </button>
        ) : (
          <div className="bg-blanco shadow-sm px-5 py-4 border-l-2 border-rojo">
            <p className="text-sm text-marron mb-1">¿Seguro que quieres eliminar este curso?</p>
            <p className="text-xs text-grisclarito mb-4">
              Se eliminarán el curso y todas sus claves. Esta acción es irreversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteCourse}
                disabled={deleting}
                className="text-xs bg-rojo text-blanco px-5 py-2 hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs border border-grisoscuro text-grisclarito px-5 py-2 hover:border-marron hover:text-marron transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
