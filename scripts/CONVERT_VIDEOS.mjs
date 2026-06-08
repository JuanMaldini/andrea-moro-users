/**
 * CONVERT_VIDEOS.mjs
 *
 * Recorre los cursos de PocketBase, descarga cada vídeo, detecta si el codec
 * o la extensión son problemáticos para browsers, los re-encodea a
 * H.264/AAC con ffmpeg, sube el convertido, actualiza json.videos
 * preservando orden y nombre, y genera un log detallado.
 *
 * Usage:  node scripts/CONVERT_VIDEOS.mjs
 *         (o desde el .bat:  CONVERT_VIDEOS.bat)
 *
 * Requiere: ffmpeg + ffprobe en PATH, y .env configurado.
 */

import { readFileSync, mkdirSync, rmSync, existsSync, appendFileSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { join } from "path";

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!existsSync(envPath)) {
  const msg = "No se encontró .env";
  console.error(msg);
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const PB_URL     = (env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");
const TOKEN      = env.PB_ADMIN_TOKEN ?? "";
const COLLECTION = env.NEXT_PUBLIC_PB_DATA ?? "andreamoro_data";
if (!PB_URL || !TOKEN) {
  const msg = "Faltan NEXT_PUBLIC_PB_URL o PB_ADMIN_TOKEN en .env";
  console.error(msg);
  process.exit(1);
}

// ── Dependencias del sistema ──────────────────────────────────────────────
try { execSync("ffmpeg -version", { stdio: "ignore" }); }
catch { console.error("ffmpeg no encontrado. Instalalo y volvé a correr."); process.exit(1); }
try { execSync("ffprobe -version", { stdio: "ignore" }); }
catch { console.error("ffprobe no encontrado. Instalalo y volvé a correr."); process.exit(1); }

// ── Rutas y constantes ────────────────────────────────────────────────────
const SCRIPT_DIR   = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TMP_DIR      = join(SCRIPT_DIR, "_convert_tmp");
const LOG_DIR      = join(SCRIPT_DIR, "_logs");

// Extensiones que NO son MP4 y requieren conversión
const BAD_EXTS  = new Set(["mov", "avi", "mkv", "wmv", "flv", "m2ts", "mts", "webm", "ogv", "mpeg", "mpg", "3gp"]);
// Codecs de video que no son H.264
const BAD_CODECS = new Set(["hevc", "h265", "vp9", "vp8", "av1", "mpeg4", "mpeg2video"]);

// ── Logger ───────────────────────────────────────────────────────────────
const LOG_FILE = join(LOG_DIR, `convert_${formatTimestamp(new Date())}.log`);
const LOG_LINES = [];

function log(...args) {
  const ts = new Date().toLocaleTimeString("es-AR");
  const line = `[${ts}] ${args.join(" ")}`;
  console.log(line);
  LOG_LINES.push(line);
}

function logSection(title) {
  const line = `\n══ ${title} ${"═".repeat(50 - title.length)}\n`;
  console.log(line.trimEnd());
  LOG_LINES.push(line.trimEnd());
}

function logError(...args) {
  const ts = new Date().toLocaleTimeString("es-AR");
  const line = `[${ts}] ❌ ERROR: ${args.join(" ")}`;
  console.error(line);
  LOG_LINES.push(line);
}

function flushLog() {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, LOG_LINES.join("\n") + "\n", "utf-8");
  } catch (e) {
    console.error(`No se pudo escribir el log en ${LOG_FILE}: ${e.message}`);
  }
}

function formatTimestamp(d) {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ── API PocketBase ────────────────────────────────────────────────────────
async function getAll() {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records?perPage=200`, {
    headers: { Authorization: TOKEN },
  });
  if (!r.ok) throw new Error(`getAll: ${r.status}`);
  return (await r.json()).items ?? [];
}

async function getRecord(id) {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${id}`, {
    headers: { Authorization: TOKEN },
  });
  if (!r.ok) throw new Error(`getRecord: ${r.status}`);
  return r.json();
}

async function downloadFile(recordId, filename, dest) {
  const url = `${PB_URL}/api/files/${COLLECTION}/${recordId}/${filename}`;
  const r = await fetch(url, { headers: { Authorization: TOKEN } });
  if (!r.ok) throw new Error(`download ${filename}: ${r.status}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

async function addFile(recordId, filePath, filename) {
  const before = await getRecord(recordId);
  const filesBefore = new Set(before.files ?? []);

  const fd = new FormData();
  fd.append("files+", new Blob([readFileSync(filePath)], { type: "video/mp4" }), filename);

  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH", headers: { Authorization: TOKEN }, body: fd,
  });
  if (!r.ok) throw new Error(`addFile ${filename}: ${r.status} ${await r.text()}`);
  const updated = await r.json();
  const actualName = (updated.files ?? []).find(f => !filesBefore.has(f)) ?? filename;
  return { updated, actualName };
}

async function removeFile(recordId, filename) {
  const fd = new FormData();
  fd.append("files-", filename);
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH", headers: { Authorization: TOKEN }, body: fd,
  });
  if (!r.ok) throw new Error(`removeFile ${filename}: ${r.status}`);
}

async function updateJson(recordId, newJson) {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ json: newJson }),
  });
  if (!r.ok) throw new Error(`updateJson: ${r.status} ${await r.text()}`);
}

// ── ffprobe: codec del primer stream de video ─────────────────────────────
function getVideoCodec(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// ── Detecta si un video necesita conversión ───────────────────────────────
function needsConversion(filePath) {
  const ext  = (extname(filePath).replace(".", "").toLowerCase());
  const extBad = BAD_EXTS.has(ext);
  let codecBad = false;

  if (!extBad) {
    const codec = getVideoCodec(filePath);
    codecBad = BAD_CODECS.has(codec ?? "");
  }

  return { needs: extBad || codecBad, reason: extBad ? `ext=${ext}` : `codec=${getVideoCodec(filePath) ?? "?"}` };
}

// ── ffmpeg: H.264 + AAC, optimizado para web ─────────────────────────────
function convert(inputPath, outputPath) {
  execSync(
    `ffmpeg -y -i "${inputPath}" -vcodec libx264 -preset fast -crf 22 -acodec aac -movflags +faststart "${outputPath}"`,
    { stdio: "inherit", timeout: 3600000 } // 1h max por video
  );
}

// ── Gitignore: asegurar que _logs/ esté excluido ──────────────────────────
function ensureGitignoreExcludesLogs() {
  const giPath = join(SCRIPT_DIR, "..", ".gitignore");
  const content = existsSync(giPath) ? readFileSync(giPath, "utf-8") : "";
  if (!content.includes("_logs/")) {
    const newContent = content.trimEnd() + "\n\n# Conversion logs\n_logs/\n";
    writeFileSync(giPath, newContent, "utf-8");
    log("📝 .gitignore actualizado: se agregó _logs/");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const startTime = Date.now();

  // Header
  console.clear();
  console.log("🎬 CONVERT_VIDEOS.mjs — Fix masivo de vídeos");
  console.log("────────────────────────────────────────────\n");

  logSection("INICIO");
  log(`PB_URL:     ${PB_URL}`);
  log(`Colección:  ${COLLECTION}`);
  log(`Tmp dir:    ${TMP_DIR}`);

  // Prep directorios
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  // Asegurar gitignore
  ensureGitignoreExcludesLogs();

  // Obtener cursos
  logSection("OBTENIENDO CURSOS DE POCKETBASE");
  let all;
  try {
    all = await getAll();
  } catch (e) {
    logError(`No se pudieron obtener los cursos: ${e.message}`);
    flushLog();
    console.log(`\n❌ Error fatal. Log disponible en:\n  ${LOG_FILE}`);
    process.exit(1);
  }

  const courses = all.filter(r => !r.json?.type || r.json.type === "course");
  log(`Cursos encontrados: ${courses.length}`);

  // Stats
  const stats = { reencoded: 0, skipped: 0, errors: 0, total: 0 };
  const errors = []; // [{course, video, step, error}]

  for (const course of courses) {
    const videos = course.json?.videos ?? [];
    if (!videos.length) continue;

    logSection(`CURSO: ${course.title} (${videos.length} vídeos)`);

    for (const video of videos) {
      stats.total++;
      const inputPath  = join(TMP_DIR, video.file);
      const baseName    = video.file.replace(/\.[^.]+$/, "");
      const outputName  = `${baseName}_h264.mp4`;
      const outputPath  = join(TMP_DIR, outputName);

      // 1. Descargar
      process.stdout.write(`  ⬇ ${video.name} (${video.file})… `);
      log(`[${stats.total}] Descargando: ${video.file} (${video.name})`);
      try {
        await downloadFile(course.id, video.file, inputPath);
        console.log("✓");
      } catch (err) {
        console.log(`❌`);
        logError(`Descarga falló: ${err.message}`);
        errors.push({ course: course.title, video: video.file, step: "download", error: err.message });
        stats.errors++;
        continue;
      }

      // 2. Detectar si necesita conversión
      let needsConv;
      try {
        needsConv = needsConversion(inputPath);
      } catch (e) {
        logError(`ffprobe falló en ${video.file}: ${e.message}`);
        errors.push({ course: course.title, video: video.file, step: "probe", error: e.message });
        rmSync(inputPath, { force: true });
        stats.errors++;
        continue;
      }

      if (!needsConv.needs) {
        console.log(`  ✓ ya está OK (${needsConv.reason}), skip`);
        log(`  Skip — ya OK: ${needsConv.reason}`);
        rmSync(inputPath, { force: true });
        stats.skipped++;
        continue;
      }
      console.log(`  🔄 Problema detectado: ${needsConv.reason}, convirtiendo…`);
      log(`  Conversión necesaria: ${needsConv.reason}`);

      // 3. Convertir
      try {
        convert(inputPath, outputPath);
        log(`  Re-encoding OK`);
      } catch (err) {
        logError(`ffmpeg falló: ${err.message}`);
        errors.push({ course: course.title, video: video.file, step: "convert", error: err.message });
        rmSync(inputPath, { force: true });
        stats.errors++;
        continue;
      }

      // 4. Subir
      log(`  Subiendo: ${outputName}`);
      let actualName;
      try {
        const res = await addFile(course.id, outputPath, outputName);
        actualName = res.actualName;
        log(`  Guardado como: ${actualName}`);
      } catch (err) {
        logError(`Upload falló: ${err.message}`);
        errors.push({ course: course.title, video: video.file, step: "upload", error: err.message });
        rmSync(inputPath, { force: true });
        rmSync(outputPath, { force: true });
        stats.errors++;
        continue;
      }

      // 5. Actualizar json.videos (mismo orden, mismo nombre, solo cambia file)
      try {
        const latest = await getRecord(course.id);
        const updatedVideos = (latest.json?.videos ?? []).map(v2 =>
          v2.file === video.file ? { ...v2, file: actualName } : v2
        );
        await updateJson(course.id, { ...latest.json, videos: updatedVideos });
        log(`  json.videos actualizado`);
      } catch (err) {
        logError(`Update json falló: ${err.message}`);
        errors.push({ course: course.title, video: video.file, step: "update-json", error: err.message });
        // Continuar igual — el archivo ya está subido, se puede reparar a mano
      }

      // 6. Borrar el archivo viejo
      try {
        await removeFile(course.id, video.file);
        log(`  Archivo original eliminado: ${video.file}`);
      } catch (err) {
        logError(`No se pudo borrar archivo original ${video.file}: ${err.message}`);
        errors.push({ course: course.title, video: video.file, step: "remove-old", error: err.message });
      }

      // Limpiar temporales
      rmSync(inputPath, { force: true });
      rmSync(outputPath, { force: true });
      stats.reencoded++;
      console.log(`  ✅ Listo`);
      log(`  ✅ Completado\n`);
    }
  }

  // Limpieza final
  rmSync(TMP_DIR, { recursive: true, force: true });

  // ── Resumen ─────────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const elapsedStr = elapsed >= 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  logSection("RESULTADO FINAL");
  log(`Total procesados:  ${stats.total}`);
  log(`Re-encoded:        ${stats.reencoded}`);
  log(`Skipped (ya OK):   ${stats.skipped}`);
  log(`Errores:          ${stats.errors}`);
  log(`Duración:          ${elapsedStr}`);

  if (errors.length > 0) {
    logSection("ERRORES DETALLADOS");
    errors.forEach((e, i) => {
      log(`[${i + 1}] Curso: ${e.course}`);
      log(`    Video: ${e.video}`);
      log(`    Paso:  ${e.step}`);
      log(`    Error: ${e.error}\n`);
    });
  }

  // Guardar log
  flushLog();

  // Mostrar resultado
  console.log(`\n────────────────────────────────────────────`);
  console.log(`  Re-encoded:  ${stats.reencoded}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  if (stats.errors > 0) {
    console.log(`  Errores:     ${stats.errors}  ← ver log abajo`);
  }
  console.log(`  Duración:    ${elapsedStr}`);
  console.log(`────────────────────────────────────────────`);

  if (stats.errors > 0) {
    console.log(`\n⚠  Hubo ${stats.errors} error(es). Leé el log para detalles:\n`);
    console.log(`   ${LOG_FILE}\n`);
  } else {
    console.log(`\n✅ Todo listo. Log guardado en:\n`);
    console.log(`   ${LOG_FILE}\n`);
  }

  // Limpiar lineas del log en memoria (ya fue a disco)
  LOG_LINES.length = 0;
})();