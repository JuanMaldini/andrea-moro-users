/**
 * auth.ts — Clave global de acceso a cursos.
 *
 * Todos los cursos usan esta misma clave. Se comparte a las alumnas
 * por WhatsApp junto con la URL del curso.
 */

/** Clave vigente: la que se muestra en el panel y se comparte. */
export const COURSE_PASSWORD = "ClaveAMT01";

/**
 * Claves antiguas que se siguen aceptando: los links ya enviados por WhatsApp
 * llevan la clave vieja y tienen que seguir funcionando.
 */
export const LEGACY_COURSE_PASSWORDS = ["PassAMT01"];

/** ¿La clave escrita por la alumna es válida? (vigente o antigua, sin distinguir mayúsculas) */
export function isValidCoursePassword(input: string): boolean {
  const value = input.trim().toLowerCase();
  return [COURSE_PASSWORD, ...LEGACY_COURSE_PASSWORDS].some(
    (p) => p.toLowerCase() === value
  );
}
