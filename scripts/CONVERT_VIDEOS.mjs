/**
 * CONVERT_VIDEOS.mjs
 *
 * Recorre los vídeos de cada curso, los descarga, los re-encodea con
 * ffmpeg a H.264 (main profile, yuv420p) + AAC en MP4 con faststart, y
 * los sube reemplazando al original.
 *
 * - DETECTA codec con ffprobe SOBRE EL REMOTO: solo descarga si hace falta.
 *     · h264/aac en .mp4      → SKIP (no baja nada).
 *     · h264/aac en .mov/etc  → REMUX a mp4 (copia streams, sin re-encode).
 *     · codec raro            → ENCODE (re-encodea de verdad).
 *   Audio ausente cuenta como válido. Idempotente.
 * - NO cambia resolución.
 * - SKIP (con log) archivos que no son video o que no existen (404).
 * - CORTA si falla ffmpeg, la red, o la API.
 *
 * Requiere: ffmpeg en PATH.
 * Ejecutar: doble click en CONVERT_VIDEOS.bat
 */

import { readFileSync, mkdirSync, rmSync, existsSync, writeFileSync, appendFileSync } from "fs";
import { writeFile } from "fs/promises";
import { execSync, spawnSync } from "child_process";
import { join } from "path";

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!existsSync(envPath)) { console.error("No se encontró .env"); process.exit(1); }
const envContent = readFileSync(envPath, "utf-8");
function envVal(key) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = envContent.match(re);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}
const PB_URL     = envVal("NEXT_PUBLIC_PB_URL").replace(/\/$/, "");
const TOKEN      = envVal("PB" + "_" + "ADMIN" + "_" + "TOKEN");
const COLLECTION = envVal("NEXT_PUBLIC_PB_DATA") || "andreamoro_data";
if (!PB_URL || !TOKEN) { console.error("Faltan NEXT_PUBLIC_PB_URL o PB_ADMIN_TOKEN en .env"); process.exit(1); }

// ── Logs ──────────────────────────────────────────────────────────────────
const LOG_DIR = join(import.meta.dirname, "_logs");
mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = join(LOG_DIR, `run-${stamp}.log`);
writeFileSync(logFile, "");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(logFile, line);
  process.stdout.write(line);
}

// ── Chequeo ffmpeg/ffprobe ────────────────────────────────────────────────
try { execSync("ffmpeg -version", { stdio: "ignore" }); }
catch { log("ffmpeg no encontrado. Instalalo y volvé a correr."); process.exit(1); }
try { execSync("ffprobe -version", { stdio: "ignore" }); }
catch { log("ffprobe no encontrado (viene con ffmpeg). Reinstalá ffmpeg."); process.exit(1); }

const TMP = join(import.meta.dirname, "_tmp");
mkdirSync(TMP, { recursive: true });

// Extensiones que SÍ se procesan
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|flv|wmv)$/i;

// ── API PocketBase ────────────────────────────────────────────────────────
async function api(method, path, body, isForm) {
  const opts = { method, headers: { Authorization: TOKEN } };
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(`${PB_URL}/api/${path}`, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} /api/${path} → HTTP ${r.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

const getAll     = async () => (await api("GET", `collections/${COLLECTION}/records?perPage=200`)).items ?? [];
const getRecord  = (id) => api("GET", `collections/${COLLECTION}/records/${id}`);

async function addFile(recordId, filePath, name) {
  const before = await getRecord(recordId);
  const filesBefore = new Set(before.files ?? []);
  const fd = new FormData();
  fd.append("files+", new Blob([readFileSync(filePath)], { type: "video/mp4" }), name);
  const updated = await api("PATCH", `collections/${COLLECTION}/records/${recordId}`, fd, true);
  return (updated.files ?? []).find(f => !filesBefore.has(f)) ?? name;
}

async function removeFile(recordId, name) {
  const fd = new FormData();
  fd.append("files-", name);
  await api("PATCH", `collections/${COLLECTION}/records/${recordId}`, fd, true);
}

const updateJson = (id, json) => api("PATCH", `collections/${COLLECTION}/records/${id}`, { json });

// ── Detección de codecs ─────────────────────────────────────────────────────
// Corre ffprobe (sirve tanto para una ruta local como para una URL http).
// Para URLs protegidas de PocketBase pasamos el header Authorization.
function probeStream(input, kind, extraArgs = []) {
  const r = spawnSync("ffprobe", [
    "-v", "error",
    ...extraArgs,
    "-select_streams", kind === "video" ? "v:0" : "a:0",
    "-show_entries", "stream=codec_name",
    "-of", "default=nw=1:nk=1",
    input,
  ]);
  return (r.stdout?.toString() || "").trim();
}

// Devuelve { vCodec, aCodec } de un input (local o URL).
function probeCodecs(input, isUrl) {
  const extra = isUrl ? ["-headers", `Authorization: ${TOKEN}\r\n`] : [];
  return {
    vCodec: probeStream(input, "video", extra),
    aCodec: probeStream(input, "audio", extra),
  };
}

// Decide qué hacer según codecs + contenedor.
//   "skip"    → ya está perfecto (h264/aac en .mp4), no se toca.
//   "remux"   → codecs OK pero contenedor no-mp4: copia sin re-encodear.
//   "encode"  → codec raro: hay que re-encodear de verdad.
// Audio ausente cuenta como válido (un video sin pista de audio está bien).
function decideAction(vCodec, aCodec, fileName) {
  const isMp4 = /\.mp4$/i.test(fileName);
  const videoOk = vCodec === "h264";
  const audioOk = aCodec === "" || aCodec === "aac";
  if (videoOk && audioOk) return isMp4 ? "skip" : "remux";
  return "encode";
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log("=== INICIO ===");

  const all = await getAll();
  const courses = all.filter(r => !r.json?.type || r.json.type === "course");
  log(`Cursos: ${courses.length}`);

  let converted = 0, skipped = 0;

  for (const course of courses) {
    const videos = (course.json?.videos ?? []).slice().sort((a, b) => a.order - b.order);
    if (!videos.length) continue;

    log(`\n=== ${course.title} (${videos.length} vídeos) ===`);

    for (const video of videos) {
      log(`\n--- ${video.name}  |  ${video.file} ---`);

      // SKIP: no es video
      if (!VIDEO_EXT.test(video.file)) {
        log(`SKIP: no es un video (extensión no reconocida)`);
        skipped++;
        continue;
      }

      const fileUrl = `${PB_URL}/api/files/${COLLECTION}/${course.id}/${video.file}`;

      // 1. Probar codecs SOBRE EL REMOTO (sin bajar el archivo entero).
      //    Así solo descargamos los que de verdad hay que tocar.
      log("Probando codecs en remoto con ffprobe...");
      const { vCodec, aCodec } = probeCodecs(fileUrl, true);
      log(`Codecs detectados → video: ${vCodec || "—"}, audio: ${aCodec || "—"}`);

      if (!vCodec) {
        // ffprobe no devolvió codec de video: o no existe (404) o no es video.
        log(`SKIP: no se pudo leer stream de video (¿404 o no es video?)`);
        skipped++;
        continue;
      }

      const action = decideAction(vCodec, aCodec, video.file);
      if (action === "skip") {
        log(`SKIP: ya está en H.264/AAC dentro de .mp4, no hace falta tocarlo`);
        skipped++;
        continue;
      }

      const inputPath  = join(TMP, video.file);
      const outputName = video.file.replace(/(_conv)*\.[^.]+$/, "") + "_conv.mp4";
      const outputPath = join(TMP, outputName);

      // 2. Ahora SÍ descargamos (porque hay que convertir o remuxear).
      log(`Hace falta ${action === "remux" ? "remux a mp4 (sin re-encode)" : "re-encode"}. Descargando...`);
      const r = await fetch(fileUrl, { headers: { Authorization: TOKEN } });
      if (r.status === 404) {
        log(`SKIP: archivo no existe en PocketBase (404)`);
        skipped++;
        continue;
      }
      if (!r.ok) throw new Error(`download ${video.file} → HTTP ${r.status}`);
      await writeFile(inputPath, Buffer.from(await r.arrayBuffer()));
      log(`OK (${(readFileSync(inputPath).length / 1024 / 1024).toFixed(1)} MB)`);

      // 3. Convertir (o remuxear copiando streams).
      const ffArgs = action === "remux"
        ? ["-y", "-i", inputPath, "-c", "copy", "-movflags", "+faststart", outputPath]
        : ["-y", "-i", inputPath,
           "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
           "-preset", "medium", "-crf", "23",
           "-c:a", "aac", "-b:a", "128k",
           "-movflags", "+faststart", outputPath];
      log(`${action === "remux" ? "Remuxeando" : "Convirtiendo"} con ffmpeg...`);
      const ff = spawnSync("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });

      if (ff.status !== 0) {
        log(`FFMPEG SALIÓ CON CÓDIGO ${ff.status}`);
        log(`STDERR:\n${ff.stderr?.toString()}`);
        throw new Error(`ffmpeg falló en ${course.title} / ${video.name}`);
      }
      log(`OK (${(readFileSync(outputPath).length / 1024 / 1024).toFixed(1)} MB)`);

      // 3. Subir
      log(`Subiendo ${outputName}...`);
      const actualName = await addFile(course.id, outputPath, outputName);
      log(`Guardado como: ${actualName}`);

      // 4. Actualizar json.videos
      const latest = await getRecord(course.id);
      const updatedVideos = (latest.json?.videos ?? []).map(v =>
        v.file === video.file ? { ...v, file: actualName } : v
      );
      await updateJson(course.id, { ...latest.json, videos: updatedVideos });
      log("json.videos actualizado");

      // 5. Borrar el viejo
      log(`Borrando ${video.file}...`);
      await removeFile(course.id, video.file);
      log("OK");

      // Cleanup local
      rmSync(inputPath,  { force: true });
      rmSync(outputPath, { force: true });

      converted++;
      log("✅ Listo");
    }
  }

  rmSync(TMP, { recursive: true, force: true });
  log(`\n=== FIN ===`);
  log(`Convertidos: ${converted}`);
  log(`Skipped:     ${skipped}`);
  log(`Log: ${logFile}`);
}

main().catch(err => {
  log(`\n❌ ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  log(`Log completo: ${logFile}`);
  process.exit(1);
});
