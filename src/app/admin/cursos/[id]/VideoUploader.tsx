"use client";

import { useState, useRef } from "react";
import { getPocketBase, COLLECTION_DATA } from "@/lib/pocketbase-browser";
import type { CourseVideo, CourseJson, CourseRecord } from "@/lib/course-utils";

interface UploadItem {
  file: File;
  newName: string;
  status: "waiting" | "uploading" | "done" | "error";
}

interface Props {
  courseId: string;
  slug: string;
  course: CourseRecord;
  videos: CourseVideo[];
  onVideosChange: (videos: CourseVideo[]) => void;
}

export default function VideoUploader({ courseId, slug, course, videos, onVideosChange }: Props) {
  const [localVideos, setLocalVideos] = useState<CourseVideo[]>(videos);
  const [showModal, setShowModal] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "";

  function fileUrl(filename: string) {
    return `${pbUrl}/api/files/${COLLECTION_DATA}/${courseId}/${filename}`;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const startIdx = localVideos.length + 1;
    const items: UploadItem[] = selected.map((f, i) => {
      const ext = f.name.split(".").pop() ?? "mp4";
      const newName = `${slug}_${startIdx + i}.${ext}`;
      return { file: f, newName, status: "waiting" };
    });
    setUploadItems(items);
    setAllDone(false);
    setShowModal(true);
    e.target.value = "";
  }

  async function startUpload() {
    setUploading(true);
    const pb = getPocketBase();
    let newVideos = [...localVideos];

    for (let i = 0; i < uploadItems.length; i++) {
      setUploadItems((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: "uploading" } : it))
      );
      const item = uploadItems[i];
      const renamed = new File([item.file], item.newName, { type: item.file.type });
      const fd = new FormData();
      fd.append("files", renamed);
      try {
        await pb.collection(COLLECTION_DATA).update(courseId, fd);
        const newVideo: CourseVideo = {
          file: item.newName,
          name: item.newName,
          order: newVideos.length + 1,
        };
        newVideos = [...newVideos, newVideo];
        setUploadItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "done" } : it))
        );
      } catch {
        setUploadItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: "error" } : it))
        );
      }
    }

    // Save updated json.videos
    const updatedJson: CourseJson = { ...course.json, videos: newVideos };
    try {
      await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
    } catch { /* ignore */ }

    setLocalVideos(newVideos);
    onVideosChange(newVideos);
    setUploading(false);
    setAllDone(true);
  }

  async function moveVideo(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= localVideos.length) return;
    const updated = [...localVideos];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const reordered = updated.map((v, i) => ({ ...v, order: i + 1 }));
    const pb = getPocketBase();
    const updatedJson: CourseJson = { ...course.json, videos: reordered };
    try {
      await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
      setLocalVideos(reordered);
      onVideosChange(reordered);
    } catch {
      alert("Error al reordenar.");
    }
  }

  async function deleteVideo(video: CourseVideo) {
    const pb = getPocketBase();
    try {
      // Remove file from PocketBase files field
      await pb.collection(COLLECTION_DATA).update(courseId, { "files-": [video.file] });
      const updated = localVideos
        .filter((v) => v.file !== video.file)
        .map((v, i) => ({ ...v, order: i + 1 }));
      const updatedJson: CourseJson = { ...course.json, videos: updated };
      await pb.collection(COLLECTION_DATA).update(courseId, { json: updatedJson });
      setLocalVideos(updated);
      onVideosChange(updated);
    } catch {
      alert("Error al eliminar el video.");
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido">
          Vídeos ({localVideos.length})
        </h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors"
        >
          + Añadir vídeos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Lista de vídeos */}
      <div className="space-y-2">
        {localVideos.map((v, idx) => (
          <div key={v.file} className="bg-blanco shadow-sm px-4 py-3 flex items-center gap-3">
            <span className="text-xs text-grisclarito w-5 text-right flex-shrink-0">
              {idx + 1}
            </span>
            <p className="flex-1 min-w-0 text-sm text-marroncalido truncate font-mono">
              {v.file}
            </p>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => moveVideo(idx, -1)}
                disabled={idx === 0}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↑
              </button>
              <button
                onClick={() => moveVideo(idx, 1)}
                disabled={idx === localVideos.length - 1}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-marron hover:text-marron transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↓
              </button>
              <button
                onClick={() => deleteVideo(v)}
                className="text-xs text-grisclarito border border-grisoscuro w-7 h-7 flex items-center justify-center hover:border-rojo hover:text-rojo transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {localVideos.length === 0 && (
          <p className="text-xs text-grisclarito text-center py-6">
            Sin vídeos. Añade el primero arriba.
          </p>
        )}
      </div>

      {/* Modal de subida */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-marron bg-opacity-30 flex items-center justify-center px-4">
          <div className="bg-blanco w-full max-w-md shadow-lg px-6 py-8">
            <p className="text-xs uppercase tracking-widest text-marroncalido mb-6">
              Subiendo vídeos
            </p>

            <div className="space-y-3 mb-6">
              {uploadItems.map((item) => (
                <div key={item.newName} className="flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">
                    {item.status === "waiting"   && "⏳"}
                    {item.status === "uploading" && "⬆️"}
                    {item.status === "done"      && "✓"}
                    {item.status === "error"     && "✗"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-grisclarito truncate">{item.file.name}</p>
                    <p className="text-xs text-marron font-mono truncate">→ {item.newName}</p>
                  </div>
                </div>
              ))}
            </div>

            {!uploading && !allDone && (
              <button
                onClick={startUpload}
                className="w-full py-3 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors"
              >
                Iniciar subida
              </button>
            )}

            {uploading && (
              <p className="text-xs text-grisclarito text-center">Subiendo, no cierres esta ventana…</p>
            )}

            {allDone && (
              <button
                onClick={() => setShowModal(false)}
                className="w-full py-3 bg-marron text-blanco text-xs uppercase tracking-widest hover:bg-marroncalido transition-colors"
              >
                Listo — cerrar
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
