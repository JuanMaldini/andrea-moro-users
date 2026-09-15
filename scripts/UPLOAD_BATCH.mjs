/**
 * UPLOAD_BATCH.mjs
 *
 * Toma todos los vídeos de una carpeta local (orden alfabético), los deja
 * compatibles con todos los navegadores (misma lógica que CONVERT_VIDEOS:
 * skip / remux / H.264 CRF 18, sin cambiar resolución ni fps) y los sube al
 * curso como records de andreamoro_videos.
 *
 * Si el curso YA tiene vídeos hay que elegir:
 *   --append   agrega al final
 *   --replace  borra los vídeos actuales del curso y deja solo los nuevos
 *
 * Uso:
 *   node scripts\UPLOAD_BATCH.mjs <carpeta_origen> <slug_curso> [--append|--replace]
 *
 * Ejemplo:
 *   node scripts\UPLOAD_BATCH.mjs "C:\Users\juanm\Downloads\Photos-3-001" flores-nepal
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import {
  COURSES, VIDEOS, api, login, listAll, createLogger, requireFfmpeg,
  createVideoRecord, probe, decide, ffmpegArgs, runFfmpeg, verifyOutput,
} from "./lib/pb-video.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [sourceArg, slugArg] = args.filter((a) => !a.startsWith("--"));
if (!sourceArg || !slugArg) {
  console.error("Uso: node scripts\\UPLOAD_BATCH.mjs <carpeta_origen> <slug_curso> [--append|--replace]");
  process.exit(1);
}
const SOURCE_DIR = sourceArg.replace(/^["']|["']$/g, "");
const COURSE_SLUG = slugArg.toLowerCase();
if (!existsSync(SOURCE_DIR)) { console.error(`No existe: ${SOURCE_DIR}`); process.exit(1); }

const log = createLogger("upload");
const TMP = join(import.meta.dirname, "_tmp_upload");
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;

async function main() {
  log("=== UPLOAD BATCH ===");
  log(`Origen: ${SOURCE_DIR}`);
  log(`Curso slug: ${COURSE_SLUG}`);
  requireFfmpeg(log);
  await login(log);

  // 1. Vídeos de la carpeta (orden alfabético)
  const files = readdirSync(SOURCE_DIR).filter((f) => VIDEO_EXT.test(f)).sort();
  if (files.length === 0) { log(`Sin vídeos en ${SOURCE_DIR}`); process.exit(1); }
  log(`Vídeos a procesar: ${files.length}`);

  // 2. Curso
  const [course] = await listAll(COURSES, { filter: `slug = "${COURSE_SLUG.replace(/[^a-z0-9-]/g, "")}"` });
  if (!course) { log(`No existe curso con slug "${COURSE_SLUG}"`); process.exit(1); }
  log(`Curso: "${course.title}" (id=${course.id})`);

  const existing = await listAll(VIDEOS, { filter: `course = "${course.id}"`, sort: "order" });
  if (existing.length && !flags.has("--append") && !flags.has("--replace")) {
    log(`El curso ya tiene ${existing.length} vídeo(s). Volvé a correr con --append (agregar al final) o --replace (reemplazar).`);
    process.exit(1);
  }
  const replace = flags.has("--replace");
  let order = replace ? 0 : existing.length;

  mkdirSync(TMP, { recursive: true });
  const uploaded = [];

  // 3. Procesar cada vídeo
  for (let i = 0; i < files.length; i++) {
    order++;
    const src = join(SOURCE_DIR, files[i]);
    const newName = `${COURSE_SLUG.replace(/-/g, "_")}_${order}.mp4`;
    const tmp = join(TMP, newName);
    log(`\n[${i + 1}/${files.length}] ${files[i]}`);

    const info = probe(src);
    const action = decide(info, { isMp4: /\.mp4$/i.test(files[i]), faststart: false });
    log(`video: ${info.vCodec} ${info.pixFmt}${info.transfer ? ` (${info.transfer})` : ""} · audio: ${info.aCodec || "—"} ⇒ ${action === "encode" ? "ENCODE" : "REMUX (sin re-encode)"}`);

    const ff = runFfmpeg(ffmpegArgs(action === "encode" ? "encode" : "remux", src, tmp, info));
    if (!ff.ok) { log(`FFMPEG FALLO:\n${ff.stderr.slice(-3000)}`); throw new Error(`ffmpeg en ${files[i]}`); }
    const check = verifyOutput(tmp, info.duration);
    if (!check.ok) throw new Error(`resultado inválido en ${files[i]}`);
    log(`OK (${(statSync(tmp).size / 1048576).toFixed(1)} MB)`);

    log("Subiendo…");
    const rec = await createVideoRecord({ course: course.id, name: `${COURSE_SLUG}_${order}`, order }, tmp, newName);
    log(`Guardado: ${rec.file}`);
    uploaded.push(rec);
    rmSync(tmp, { force: true });
  }

  // 4. --replace: recién ahora (todo subió bien) se borran los anteriores
  if (replace && existing.length) {
    log(`\nBorrando ${existing.length} vídeo(s) anteriores…`);
    for (const v of existing) await api("DELETE", `collections/${VIDEOS}/records/${v.id}`);
    log("OK");
  }

  rmSync(TMP, { recursive: true, force: true });
  log(`\n=== FIN ===`);
  log(`Subidos: ${uploaded.length}`);
  log(`Log: ${log.file}`);
}

main().catch((err) => {
  log(`\n❌ ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  process.exit(1);
});
