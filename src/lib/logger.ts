/**
 * logger.ts — utilidad de logging para Server Components y Route Handlers.
 * Produce mensajes limpios en la consola en lugar de `Object`.
 */

function fmt(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const log = {
  error(label: string, err?: unknown) {
    const msg = err !== undefined ? `${label}: ${fmt(err)}` : label;
    console.error(`[error] ${msg}`);
  },
  warn(label: string, data?: unknown) {
    const msg = data !== undefined ? `${label}: ${fmt(data)}` : label;
    console.warn(`[warn] ${msg}`);
  },
  info(_label: string, _data?: unknown) {
    // suprimido en producción y desarrollo
  },
};
