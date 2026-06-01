// Tipos para la estructura de cursos

export interface CourseVideo {
  file: string;
  name: string;
  order: number;
}

export interface CourseJson {
  published?: boolean;
  slug?: string;
  token?: string;    // un único token por curso — forma parte de la URL
  keys?: string[];   // lista de correos con acceso
  videos?: CourseVideo[];
  gallery?: string[]; // nombres de archivo (dentro del campo `files`) que son fotos
}

export interface CourseRecord {
  id: string;
  files: string[];      // ÚNICO campo de archivos: contiene vídeos Y fotos.
                        // El reparto (qué es vídeo / qué es foto) vive en `json`.
  title: string;
  description: string;
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

  return { slug, token };
}

/**
 * Construye la URL pública de un alumno para un curso.
 * Ej: buildCourseUrl("tecnica-base", "a3f9b2c1") → "/tecnica-base_a3f9b2c1"
 */
export function buildCourseUrl(slug: string, token: string): string {
  return `/${slug}_${token}`;
}
