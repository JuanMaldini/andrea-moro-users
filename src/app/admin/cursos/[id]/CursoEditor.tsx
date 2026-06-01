"use client";

import { useState } from "react";
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

export default function CursoEditor({ course, host }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [published, setPublished] = useState(course.json?.published ?? false);
  const [keys, setKeys] = useState<CourseKey[]>(course.json?.keys ?? []);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [keyError, setKeyError] = useState("");

  const slug = course.json?.slug ?? course.id;

  async function saveJson(newKeys: CourseKey[], newJson?: Partial<CourseJson>) {
    const pb = getPocketBase();
    const updatedJson: CourseJson = {
      ...course.json,
      published,
      keys: newKeys,
      ...newJson,
    };
    await pb.collection(COLLECTION_DATA).update(course.id, {
      json: updatedJson,
    });
  }

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setMetaMsg("");
    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_DATA).update(course.id, {
        title,
        description,
        json: { ...course.json, published },
      });
      setMetaMsg("Guardado.");
      router.refresh();
    } catch {
      setMetaMsg("Error al guardar.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    setKeyError("");

    const emailTrimmed = newEmail.trim().toLowerCase();
    if (!emailTrimmed) return;

    if (keys.some((k: CourseKey) => k.email.toLowerCase() === emailTrimmed)) {
      setKeyError("Ya existe una clave para ese correo.");
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
      await saveJson(updated);
      setKeys(updated);
      setNewEmail("");
      setNewLabel("");
    } catch {
      setKeyError("Error al guardar la clave.");
    } finally {
      setAddingKey(false);
    }
  }

  async function handleDeleteKey(token: string) {
    const updated = keys.filter((k: CourseKey) => k.token !== token);
    try {
      await saveJson(updated);
      setKeys(updated);
    } catch {
      alert("Error al eliminar la clave.");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="space-y-10">

      {/* === Información del curso === */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-marroncalido mb-5">
          Información
        </h2>
        <form onSubmit={handleSaveMeta} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-grisclarito mb-2">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-grisclarito mb-2">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-grisclarito mb-2">
              URL base
            </label>
            <p className="text-sm text-marroncalido font-mono">
              /{slug}_xxxxxxxx
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="published"
              type="checkbox"
              checked={published}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPublished(e.target.checked)}
              className="w-4 h-4 accent-marron"
            />
            <label htmlFor="published" className="text-xs text-marroncalido">
              Publicado (visible para las alumnas)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingMeta}
              className="px-6 py-2 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors disabled:opacity-50"
            >
              {savingMeta ? "Guardando..." : "Guardar"}
            </button>
            {metaMsg && (
              <span className="text-xs text-grisclarito">{metaMsg}</span>
            )}
          </div>
        </form>
      </section>

      {/* === Claves de acceso === */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-marroncalido mb-5">
          Claves de acceso ({keys.length})
        </h2>

        {/* Añadir nueva clave */}
        <form onSubmit={handleAddKey} className="bg-blanco shadow-sm px-5 py-4 mb-4">
          <p className="text-xs text-grisclarito mb-3">Añadir nueva clave</p>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              value={newEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNewEmail(e.target.value)}
              required
              placeholder="correo o clave (ej: alumna@gmail.com)"
              className="flex-1 min-w-0 px-4 py-2 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNewLabel(e.target.value)}
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
          {keyError && (
            <p className="text-rojo text-xs mt-2">{keyError}</p>
          )}
        </form>

        {/* Lista de claves */}
        <div className="space-y-2">
          {keys.map((k: CourseKey) => {
            const url = `${host}${buildCourseUrl(slug, k.token)}`;
            return (
              <div
                key={k.token}
                className="bg-blanco shadow-sm px-5 py-4"
              >
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
                      onClick={() => copyToClipboard(url)}
                      title="Copiar URL"
                      className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-marron hover:text-marron transition-colors"
                    >
                      Copiar URL
                    </button>
                    <button
                      onClick={() => handleDeleteKey(k.token)}
                      title="Eliminar clave"
                      className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 hover:border-rojo hover:text-rojo transition-colors"
                    >
                      ×
                    </button>
                  </div>
                </div>
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
    </div>
  );
}
