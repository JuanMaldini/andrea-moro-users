/**
 * CONVERT_VIDEOS.mjs
 *
 * Recorre los cursos de PocketBase, descarga cada vídeo y, si su codec
 * no es H.264 (ej: HEVC/H.265 desde iPhone, que rompe en Chrome/Firefox),
 * lo re-encodea a H.264/AAC con ffmpeg, lo sube reemplazando al original
 * y conserva el orden y nombre en json.videos.
 *
 * Requiere: ffmpeg + ffprobe en PATH.
 * Ejecutar desde la raíz del proyecto:   node CONVERT_VIDEOS.mjs
 */

import { readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { extname, join } from "path";

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!existsSync(envPath)) { console.error("No se encontró .env"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8").split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const PB_URL    = (env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");
const TOKEN     = env.PB_ADMIN_TOKEN ?? "";
const COLLECTION = env.NEXT_PUBLIC_PB_DATA ?? "andreamoro_data";
if (!PB_URL || !TOKEN) { console.error("Faltan NEXT_PUBLIC_PB_URL o PB_ADMIN_TOKEN en .env"); process.exit(1); }

// Chequeo ffmpeg/ffprobe
try { execSync("ffmpeg -version", { stdio: "ignore" }); }
catch { console.error("ffmpeg no encontrado. Instalalo y volvé a correr."); process.exit(1); }
try { execSync("ffprobe -version", { stdio: "ignore" }); }
catch { console.error("ffprobe no encontrado. Instalalo y volvé a correr."); process.exit(1); }

const TMP = join(import.meta.dirname, "_convert_tmp");

// ── API PocketBase ────────────────────────────────────────────────────────
async function getAll() {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records?perPage=200`, { headers: { Authorization: TOKEN } });
  if (!r.ok) throw new Error(`getAll: ${r.status}`);
  return (await r.json()).items ?? [];
}

async function getRecord(id) {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${id}`, { headers: { Authorization: TOKEN } });
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
      { encoding: "utf-8" }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// ── ffmpeg: H.264 + AAC, optimizado para web ─────────────────────────────
function convert(inputPath, outputPath) {
  execSync(
    `ffmpeg -y -i "${inputPath}" -vcodec libx264 -preset fast -crf 22 -acodec aac -movflags +faststart "${outputPath}"`,
    { stdio: "inherit" }
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log("🎬 CONVERT_VIDEOS.mjs\n");
  console.log("Detecta vídeos con codecs no compatibles con Chrome/Firefox (HEVC/H.265, etc.) y los re-encodea a H.264/AAC.\n");

  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const all = await getAll();
  const courses = all.filter(r => !r.json?.type || r.json.type === "course");
  console.log(`Cursos encontrados: ${courses.length}\n`);

  let totalReencoded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const course of courses) {
    const videos = course.json?.videos ?? [];
    if (!videos.length) continue;

    console.log(`📁 ${course.title} (${videos.length} vídeos)`);

    for (const video of videos) {
      const inputPath = join(TMP, video.file);
      const baseName = video.file.replace(/\.[^.]+$/, "");
      const outputName = `${baseName}_h264.mp4`;
      const outputPath = join(TMP, outputName);

      // 1. Descargar
      process.stdout.write(`  ⬇ ${video.name} (${video.file})… `);
      try {
        await downloadFile(course.id, video.file, inputPath);
      } catch (err) {
        console.log(`❌ ${err.message}`);
        totalErrors++;
        continue;
      }

      // 2. Detectar codec
      const codec = getVideoCodec(inputPath);
      if (codec === "h264") {
        console.log(`✓ ya es H.264, skip`);
        rmSync(inputPath, { force: true });
        totalSkipped++;
        continue;
      }
      console.log(`codec=${codec ?? "?"}`);

      // 3. Convertir
      console.log(`  🔄 Re-encoding a H.264…`);
      try {
        convert(inputPath, outputPath);
      } catch (err) {
        console.log(`  ❌ ffmpeg falló: ${err.message}`);
        rmSync(inputPath, { force: true });
        totalErrors++;
        continue;
      }

      // 4. Subir (PocketBase le pone un nombre único con sufijo)
      console.log(`  ⬆ Subiendo ${outputName}…`);
      let actualName;
      try {
        const res = await addFile(course.id, outputPath, outputName);
        actualName = res.actualName;
        console.log(`     → guardado como: ${actualName}`);
      } catch (err) {
        console.log(`  ❌ ${err.message}`);
        rmSync(inputPath, { force: true });
        rmSync(outputPath, { force: true });
        totalErrors++;
        continue;
      }

      // 5. Actualizar json.videos (mismo nombre, mismo order, solo cambia file)
      const latest = await getRecord(course.id);
      const updatedVideos = (latest.json?.videos ?? []).map(v2 =>
        v2.file === video.file ? { ...v2, file: actualName } : v2
      );
      await updateJson(course.id, { ...latest.json, videos: updatedVideos });
      console.log(`  ✏ json.videos actualizado`);

      // 6. Borrar el archivo viejo
      console.log(`  🗑 Borrando ${video.file}…`);
      await removeFile(course.id, video.file);

      rmSync(inputPath, { force: true });
      rmSync(outputPath, { force: true });
      totalReencoded++;
      console.log(`  ✅ Listo\n`);
    }
  }

  rmSync(TMP, { recursive: true, force: true });

  console.log(`\n── Resultado ─────────────────────────`);
  console.log(`  Re-encoded:  ${totalReencoded}`);
  console.log(`  Skipped:     ${totalSkipped} (ya eran H.264)`);
  if (totalErrors) console.log(`  Errores:     ${totalErrors}`);
  console.log(`──────────────────────────────────────\n`);
})();
