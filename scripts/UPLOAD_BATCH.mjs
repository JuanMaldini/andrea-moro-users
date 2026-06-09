/**
 * UPLOAD_BATCH.mjs
 *
 * Toma todos los videos de una carpeta local, los convierte a H.264
 * con ffmpeg y los sube al curso especificado. Actualiza json.videos
 * preservando el orden alfabetico de los archivos originales.
 *
 * Uso:
 *   node scripts\UPLOAD_BATCH.mjs <carpeta_origen> <slug_curso>
 *
 * Ejemplo:
 *   node scripts\UPLOAD_BATCH.mjs "C:\Users\juanm\Downloads\Photos-3-001" flores-nepal
 */

import { readFileSync, mkdirSync, rmSync, existsSync, writeFileSync, appendFileSync, readdirSync, statSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { join, extname, basename } from "path";

// ── Args ───────────────────────────────────────────────────────────────────
const [, , sourceArg, slugArg] = process.argv;
if (!sourceArg || !slugArg) {
  console.error("Uso: node scripts\\UPLOAD_BATCH.mjs <carpeta_origen> <slug_curso>");
  process.exit(1);
}
const SOURCE_DIR = sourceArg.replace(/^["']|["']$/g, "");
const COURSE_SLUG = slugArg;
if (!existsSync(SOURCE_DIR)) { console.error(`No existe: ${SOURCE_DIR}`); process.exit(1); }

// ── .env ───────────────────────────────────────────────────────────────────
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
if (!PB_URL || !TOKEN) { console.error("Faltan env vars"); process.exit(1); }

// ── Logs ───────────────────────────────────────────────────────────────────
const LOG_DIR = join(import.meta.dirname, "_logs");
mkdirSync(LOG_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logFile = join(LOG_DIR, `upload-${stamp}.log`);
writeFileSync(logFile, "");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(logFile, line);
  process.stdout.write(line);
}

// ── Chequeo ffmpeg ─────────────────────────────────────────────────────────
try { execSync("ffmpeg -version", { stdio: "ignore" }); }
catch { log("ffmpeg no encontrado. Instalalo."); process.exit(1); }

const TMP = join(import.meta.dirname, "_tmp_upload");
mkdirSync(TMP, { recursive: true });

// ── API ────────────────────────────────────────────────────────────────────
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

const slugUnderscored = COURSE_SLUG.replace(/-/g, "_");
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm)$/i;

// Lee el codec del primer stream de video/audio de un archivo local.
function probeStream(input, kind) {
  const r = spawnSync("ffprobe", [
    "-v", "error",
    "-select_streams", kind === "video" ? "v:0" : "a:0",
    "-show_entries", "stream=codec_name",
    "-of", "default=nw=1:nk=1",
    input,
  ]);
  return (r.stdout?.toString() || "").trim();
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  log("=== UPLOAD BATCH ===");
  log(`Origen: ${SOURCE_DIR}`);
  log(`Curso slug: ${COURSE_SLUG}`);

  // 1. Listar videos de la carpeta (orden alfabetico)
  const files = readdirSync(SOURCE_DIR)
    .filter(f => VIDEO_EXT.test(f))
    .sort();
  if (files.length === 0) { log(`Sin videos en ${SOURCE_DIR}`); process.exit(1); }
  log(`Videos a procesar: ${files.length}`);

  // 2. Encontrar el record del curso
  const records = (await api("GET", `collections/${COLLECTION}/records?perPage=200`)).items ?? [];
  const course = records.find(r => r.json?.slug === COURSE_SLUG);
  if (!course) { log(`No existe curso con slug "${COURSE_SLUG}"`); process.exit(1); }
  log(`Curso: "${course.title}" (id=${course.id})`);

  // 3. Procesar cada video
  const uploaded = [];
  for (let i = 0; i < files.length; i++) {
    const order = i + 1;
    const src = join(SOURCE_DIR, files[i]);
    const newName = `${slugUnderscored}_${order}.mp4`;
    const tmp = join(TMP, newName);

    log(`\n[${order}/${files.length}] ${files[i]}`);

    // 3a. Probar codecs del archivo local: solo re-encodeamos si hace falta.
    const vCodec = probeStream(src, "video");
    const aCodec = probeStream(src, "audio");
    const isMp4 = /\.mp4$/i.test(files[i]);
    const codecsOk = vCodec === "h264" && (aCodec === "" || aCodec === "aac");
    const mode = codecsOk ? (isMp4 ? "copy" : "remux") : "encode";
    log(`Codecs → video: ${vCodec || "—"}, audio: ${aCodec || "—"}  ⇒ ${mode}`);

    const ffArgs = mode === "encode"
      ? ["-y", "-i", src,
         "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
         "-preset", "medium", "-crf", "23",
         "-c:a", "aac", "-b:a", "128k",
         "-movflags", "+faststart", tmp]
      : ["-y", "-i", src, "-c", "copy", "-movflags", "+faststart", tmp];
    log(mode === "encode" ? "Convirtiendo..." : "Empaquetando a mp4 (sin re-encode)...");
    const ff = spawnSync("ffmpeg", ffArgs, { stdio: ["ignore", "pipe", "pipe"] });
    if (ff.status !== 0) {
      log(`FFMPEG FALLO: ${ff.stderr?.toString()}`);
      throw new Error(`ffmpeg en ${files[i]}`);
    }
    const outSize = (statSync(tmp).size / 1024 / 1024).toFixed(1);
    log(`OK (${outSize} MB)`);

    // 3b. Upload (files+)
    log("Subiendo...");
    const before = new Set(course.files ?? []);
    const fd = new FormData();
    fd.append("files+", new Blob([readFileSync(tmp)], { type: "video/mp4" }), newName);
    const updated = await api("PATCH", `collections/${COLLECTION}/records/${course.id}`, fd, true);
    const actual = (updated.files ?? []).find(f => !before.has(f)) ?? newName;
    log(`Guardado: ${actual}`);

    uploaded.push({ order, name: `${COURSE_SLUG}_${order}`, file: actual });

    // cleanup tmp
    rmSync(tmp, { force: true });
  }

  // 4. Update json.videos (reemplaza lista, preserva el resto del json)
  log(`\nActualizando json.videos con ${uploaded.length} entradas...`);
  await api("PATCH", `collections/${COLLECTION}/records/${course.id}`, {
    json: { ...course.json, videos: uploaded }
  });
  log("OK");

  rmSync(TMP, { recursive: true, force: true });
  log(`\n=== FIN ===`);
  log(`Subidos: ${uploaded.length}`);
  log(`Log: ${logFile}`);
}

main().catch(err => {
  log(`\n❌ ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  process.exit(1);
});
