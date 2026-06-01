"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import { generateToken } from "@/lib/course-utils";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export default function NuevoCursoForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManual) setSlug(slugify(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const finalSlug = slug || slugify(title);

    // Clave por defecto para poder testear acceso
    const defaultKey = {
      email: "passamt",
      token: generateToken(),
      label: "Clave por defecto",
      addedAt: new Date().toISOString(),
    };

    try {
      const pb = getPocketBase();
      const record = await pb.collection(COLLECTION_DATA).create({
        title,
        description,
        json: {
          published: false,
          slug: finalSlug,
          keys: [defaultKey],
          videos: [],
        },
      });
      router.push(`/admin/cursos/${record.id}`);
    } catch (err) {
      setError("Error al crear el curso. Comprueba la conexión con PocketBase.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-marroncalido mb-2">
          Título del curso
        </label>
        <input
          type="text"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleTitleChange(e.target.value)}
          required
          className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
          placeholder="Técnica base de costura"
        />
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-marroncalido mb-2">
          Slug (nombre en la URL)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-grisclarito text-sm">/</span>
          <input
            type="text"
            value={slug}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              setSlugManual(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            required
            className="flex-1 px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
            placeholder="tecnica-base"
          />
          <span className="text-grisclarito text-sm">_xxxxxxxx</span>
        </div>
        <p className="text-xs text-grisclarito mt-1">
          URL final: /{slug || "slug-del-curso"}_
          <span className="text-marroncalido">token8chars</span>
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-marroncalido mb-2">
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors resize-none"
          placeholder="Descripción del curso que verán las alumnas antes de entrar."
        />
      </div>

      <div className="bg-vanilla border border-grisoscuro px-4 py-3">
        <p className="text-xs text-grisclarito">
          Se creará con una clave por defecto{" "}
          <code className="text-marron">passamt</code> para que puedas testear el
          acceso. Puedes eliminarla desde el panel del curso una vez todo esté listo.
        </p>
      </div>

      {error && <p className="text-rojo text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Creando..." : "Crear curso"}
      </button>
    </form>
  );
}
