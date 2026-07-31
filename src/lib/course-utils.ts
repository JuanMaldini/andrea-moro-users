// Tipos para la estructura de cursos

export interface CourseVideo {
  file: string;
  name: string;
  order: number;
}

/**
 * Material de apoyo descargable del curso (fotos de referencia, vídeos extra).
 * Por ahora solo se admiten imágenes y vídeos — ver ResourcesUploader.
 * Como los vídeos y la galería, el archivo vive en el campo `files` del record;
 * aquí solo se guarda el reparto y los nombres.
 */
export interface CourseResource {
  file: string;     // nombre real dentro de `files` (el que asignó PocketBase)
  name: string;     // nombre de display, editable
  original: string; // nombre original del archivo subido
  order: number;
}

export interface CourseJson {
  published?: boolean; // siempre true; se conserva por compat con datos existentes
  slug?: string;
  token?: string;    // parte de la URL del curso (no se valida, solo identifica)
  videos?: CourseVideo[];
  gallery?: string[]; // nombres de archivo (dentro del campo `files`) que son fotos
  resources?: CourseResource[]; // material de apoyo descargable
  type?: "course" | "gallery" | "andrea"; // discriminador: undefined/absent = curso
}

export interface CourseRecord {
  id: string;
  files: string[];      // ÚNICO campo de archivos: contiene vídeos Y fotos.
                        // El reparto (qué es vídeo / qué es foto) vive en `json`.
  title: string;
  description: string;
  price: number;        // Precio en ARS — campo raíz en PocketBase
  json: CourseJson;
  created: string;
  updated: string;
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
