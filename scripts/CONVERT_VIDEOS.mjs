/**
 * CONVERT_VIDEOS.mjs
 *
 * Objetivo: que TODOS los vídeos de los cursos se reproduzcan en todos los
 * navegadores, sin cambiar resolución, fps ni calidad perceptible.
 *
 * Por cada record de andreamoro_videos (analiza el remoto, sin descargar):
 *   · h264 8-bit (+aac o sin audio) en .mp4 con faststart → SKIP
 *   · codecs OK pero sin faststart / contenedor no-mp4    → REMUX (copia, sin pérdida)
 *   · HEVC, 10-bit, u otro codec incompatible             → ENCODE (H.264 CRF 18)
 *
 * Seguridad:
 *   · Por defecto SIMULA (solo lista acciones). --apply para ejecutar.
 *   · Verifica el resultado local (h264 + misma duración) antes de subir.
 *   · Sube como record NUEVO (mismo curso/nombre/orden), verifica el remoto,
 *     y recién ahí borra el record viejo. Si algo falla, el original queda.
 *   · Descarga y subida por streaming (no carga vídeos en memoria).
 *
 * Requiere: ffmpeg en PATH y en .env PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD.
 * Ejecutar: doble click en CONVERT_VIDEOS.bat  (o CONVERT_VIDEOS.bat --apply)
 */

import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  COURSES, VIDEOS, api, login, listAll, createLogger, requireFfmpeg,
  videoFileUrl, downloadTo, createVideoRecord, probe, hasFaststart, decide,
  ffmpegArgs, runFfmpeg, verifyOutput,
} from "./lib/pb-video.mjs";

const APPLY = process.argv.includes("--apply");
const log = createLogger("run");
const TMP = join(import.meta.dirname, "_tmp");

async function main() {
  log(`=== INICIO — ${APPLY ? "APLICANDO" : "SIMULACIÓN (usar --apply para ejecutar)"} ===`);
  requireFfmpeg(log);
  await login(log);

  const courses = await listAll(COURSES, { sort: "title" });
  const videos = await listAll(VIDEOS, { sort: "order" });
  log(`Cursos: ${courses.length} · Vídeos: ${videos.length}`);

  const counts = { skip: 0, remux: 0, encode: 0, failed: 0, unreadable: 0 };
  mkdirSync(TMP, { recursive: true });

  for (const course of courses) {
    const list = videos.filter((v) => v.course === course.id);
    if (!list.length) continue;
    log(`\n=== ${course.title} (${list.length} vídeos) ===`);

    for (const video of list) {
      log(`\n--- ${video.name}  |  ${video.file} ---`);
      const url = videoFileUrl(video);

      const info = probe(url);
      if (!info.vCodec || !Number.isFinite(info.duration) || info.duration <= 0) {
        log("SKIP: no se pudo leer el stream de vídeo (¿404 o no es vídeo?)");
        counts.unreadable++;
        continue;
      }
      const isMp4 = /\.mp4$/i.test(video.file);
      const faststart = isMp4 ? await hasFaststart(url) : false;
      const action = decide(info, { isMp4, faststart });
      log(`video: ${info.vCodec} ${info.pixFmt}${info.transfer ? ` (${info.transfer})` : ""} · audio: ${info.aCodec || "—"} · faststart: ${isMp4 ? (faststart ? "sí" : "no") : "n/a"} ⇒ ${action.toUpperCase()}`);

      if (action === "skip") { counts.skip++; continue; }
      if (!APPLY) { counts[action]++; continue; }

      const base = video.file.replace(/\.[^.]+$/, "");
      const inputPath = join(TMP, video.file);
      const outputName = `${base.replace(/(_conv)+$/, "")}.mp4`;
      const outputPath = join(TMP, `out_${outputName}`);

      try {
        log("Descargando…");
        const size = await downloadTo(url, inputPath);
        log(`OK (${(size / 1048576).toFixed(1)} MB)`);

        log(action === "remux" ? "Remuxeando (sin re-encode)…" : "Convirtiendo a H.264 (misma resolución y fps)…");
        const ff = runFfmpeg(ffmpegArgs(action, inputPath, outputPath, info));
        if (!ff.ok) throw new Error(`ffmpeg falló:\n${ff.stderr.slice(-3000)}`);

        const local = verifyOutput(outputPath, info.duration);
        if (!local.ok) throw new Error(`resultado inválido (codec ${local.info.vCodec}, ${local.info.duration}s vs ${info.duration}s)`);

        log("Subiendo como record nuevo…");
        const created = await createVideoRecord(
          { course: video.course, name: video.name, order: video.order },
          outputPath,
          outputName
        );
        const remote = verifyOutput(videoFileUrl(created), info.duration);
        if (!remote.ok || !(await hasFaststart(videoFileUrl(created)))) {
          await api("DELETE", `collections/${VIDEOS}/records/${created.id}`).catch(() => {});
          throw new Error("la verificación remota falló; se descartó el nuevo y el original queda intacto");
        }

        await api("DELETE", `collections/${VIDEOS}/records/${video.id}`);
        log(`✅ Reemplazado: ${video.id} → ${created.id} (${created.file})`);
        counts[action]++;
      } catch (err) {
        counts.failed++;
        log(`❌ ${err.message}\n(el original no se tocó; se sigue con el próximo)`);
      } finally {
        rmSync(inputPath, { force: true });
        rmSync(outputPath, { force: true });
      }
    }
  }

  rmSync(TMP, { recursive: true, force: true });
  log(`\n=== FIN ===`);
  log(`${APPLY ? "" : "[simulación] "}OK sin cambios: ${counts.skip} · remux: ${counts.remux} · encode: ${counts.encode} · ilegibles: ${counts.unreadable} · fallidos: ${counts.failed}`);
  log(`Log: ${log.file}`);
  if (counts.failed || counts.unreadable) process.exitCode = 1;
}

main().catch((err) => {
  log(`\n❌ ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  log(`Log completo: ${log.file}`);
  process.exit(1);
});
