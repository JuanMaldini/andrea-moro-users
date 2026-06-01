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
        title: title.trim(),
        description,
        json: {
          published: true,
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
        <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">
          Título del curso
        </label>
        <input
          type="text"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron focus:border-marron transition-all"
          placeholder="Técnica base de costura"
        />
        {slug && (
          <p className="text-sm text-marron font-mono font-semibold mt-2">
            /{slug}_<span className="text-grisclaro bg-marron px-1 rounded">xxxxxxxx</span>
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-bold uppercase tracking-widest text-marron mb-3">
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron focus:border-marron transition-all resize-none"
          placeholder="Descripción del curso que verán las alumnas antes de entrar."
        />
      </div>

      {error && <p className="text-rojo text-base font-semibold bg-rojo/10 px-4 py-3 rounded border border-rojo">{error}</p>}

      <button
        type="submit"
        disabled={loading || !slug}
        className="w-full py-3 bg-marron text-blanco text-base font-bold uppercase tracking-widest hover:bg-marroncalido transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Creando..." : "Crear curso"}
      </button>
    </form>
  );
}
