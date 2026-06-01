"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import type { CourseRecord, CourseJson } from "@/lib/course-utils";

interface Props {
  courseId: string;
  published: boolean;
}

export default function PublishButton({ courseId, published: initialPublished }: Props) {
  const router = useRouter();
  const [published, setPublished] = useState(initialPublished);
  const [loading, setLoading] = useState(false);

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !published;
    setLoading(true);
    try {
      const pb = getPocketBase();
      const latest = await pb.collection(COLLECTION_DATA).getOne<CourseRecord>(courseId);
      const updatedJson: CourseJson = { ...latest.json, published: next };
      await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
      setPublished(next);
      router.refresh();
    } catch (err) {
      console.error("[PublishButton]", err);
      alert("Error al actualizar. Recarga e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      title={published ? "Despublicar" : "Publicar"}
      className={`text-[10px] md:text-xs font-semibold border border-marron px-2 md:px-3 py-1 whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        published
          ? "text-marron/40 hover:border-marron hover:text-marron"
          : "text-marron hover:bg-marron hover:text-blanco"
      }`}
    >
      {loading ? "…" : published ? "✓ Publicado" : "Publicar"}
    </button>
  );
}
