// Tipos y utilidades de cursos (colecciones v2: courses / videos / media)

/** Curso — record de `andreamoro_courses`. */
export interface CourseRecord {
  id: string;
  title: string;
  description: string;
  price: number;        // Precio en ARS
  slug: string;         // fijo desde la creación: los links enviados no se rompen
  token: string;        // 8 hex, parte de la URL (no se valida, solo identifica)
  published: boolean;
  created: string;
  updated: string;
}

/** Vídeo de un curso — record de `andreamoro_videos` (un archivo por record). */
export interface VideoRecord {
  id: string;
  course: string;
  file: string;
  name: string;
  order: number;
}

export type MediaKind = "resource" | "gallery" | "site_gallery" | "site_andrea";

/**
 * Archivo suelto — record de `andreamoro_media`.
 *  - resource:     material de apoyo descargable del curso
 *  - gallery:      fotos del curso
 *  - site_gallery / site_andrea: galerías de la página principal (sin curso)
 */
export interface MediaRecord {
  id: string;
  course: string;   // "" en las galerías del sitio
  kind: MediaKind;
  file: string;
  name: string;
  original: string;
  order: number;
}

/**
 * Genera un token de 8 caracteres hexadecimales aleatorios.
 * Funciona tanto en Node.js (server) como en el navegador.
 */
export function generateToken(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** "Técnica Base" → "tecnica-base" */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Devuelve `base` si no está usado; si no, `base-2`, `base-3`…
 * `taken` = slugs existentes.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * Parsea el param de URL como "tecnica-base_a3f9b2c1"
 * → { slug: "tecnica-base", token: "a3f9b2c1" }
 * Devuelve null si el formato no es válido.
 */
export function parseCourseAccess(
  courseAccess: string
): { slug: string; token: string } | null {
  const lastUnderscore = courseAccess.lastIndexOf("_");
  if (lastUnderscore === -1) return null;

  const token = courseAccess.slice(lastUnderscore + 1);
  const slug = courseAccess.slice(0, lastUnderscore);

  if (!/^[0-9a-f]{8}$/.test(token)) return null;
  if (!slug) return null;
  // Solo letras minúsculas, números y guiones — evita inyecciones en filtros PocketBase.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  return { slug, token };
}

/**
 * Construye la URL pública de un alumno para un curso.
 * Ej: buildCourseUrl("tecnica-base", "a3f9b2c1") → "/tecnica-base_a3f9b2c1"
 */
export function buildCourseUrl(slug: string, token: string): string {
  return `/${slug}_${token}`;
}

// ─── Recursos ────────────────────────────────────────────────────────────────

export type ResourceKind = "image" | "video" | "pdf" | "other";

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp", "svg"];
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "avi", "mkv", "wmv"];

/**
 * Deduce el tipo de un recurso por su extensión — decide qué miniatura mostrar
 * y cómo previsualizarlo (imagen / reproductor / iframe de PDF).
 */
export function resourceKind(filename: string): ResourceKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "other";
}

/** "molde-base.pdf" → "molde-base" */
export function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}
