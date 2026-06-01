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
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const slug = slugify(title);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const courseToken = generateToken();

    try {
      const pb = getPocketBase();
      const record = await pb.collection(COLLECTION_DATA).create({
        title,
        description,
        json: {
          published: false,
          slug,
          token: courseToken,
          keys: ["passamt"],
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors"
          placeholder="Técnica base de costura"
        />
        {slug && (
          <p className="text-xs text-grisclarito mt-1 font-mono">
            /{slug}_<span className="text-marroncalido">xxxxxxxx</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-widest text-marroncalido mb-2">
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-grisoscuro bg-vanilla text-sm focus:outline-none focus:border-marron transition-colors resize-none"
          placeholder="Descripción del curso que verán las alumnas antes de entrar."
        />
      </div>

      {error && <p className="text-rojo text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading || !slug}
        className="w-full py-3 bg-marron text-blanco text-xs font-medium uppercase tracking-widest hover:bg-marroncalido transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Creando..." : "Crear curso"}
      </button>
    </form>
  );
}
