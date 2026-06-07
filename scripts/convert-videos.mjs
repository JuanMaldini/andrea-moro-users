/**
 * convert-videos.mjs
 *
 * Busca todos los cursos en PocketBase que tengan vídeos en formatos
 * no compatibles con Chrome/Firefox (.mov, .avi, etc.), los descarga,
 * los convierte a MP4 H.264 con ffmpeg, sube la versión convertida y
 * borra el archivo original.
 *
 * Requiere: ffmpeg instalado en el sistema
 * Ejecutar: node scripts/convert-videos.mjs
 */

import { readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";
import { extname, join } from "path";

// ── .env ──────────────────────────────────────────────────────────────────────
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

const UNSUPPORTED = new Set(["mov", "avi", "mkv", "wmv", "flv", "m2ts", "mts"]);
const TMP = "/tmp/video-convert";

// ── API helpers ───────────────────────────────────────────────────────────────
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

async function uploadFile(recordId, filePath, filename) {
  // Leer record antes para saber qué archivos ya existen
  const before = await getRecord(recordId);
  const filesBefore = new Set(before.files ?? []);

  const data = readFileSync(filePath);
  const fd = new FormData();
  fd.append("files+", new Blob([data], { type: "video/mp4" }), filename);

  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH", headers: { Authorization: TOKEN }, body: fd,
  });
  if (!r.ok) throw new Error(`upload ${filename}: ${r.status} ${await r.text()}`);
  const updated = await r.json();

  // Nombre real que asignó PocketBase (puede añadir sufijo)
  const actualName = (updated.files ?? []).find(f => !filesBefore.has(f)) ?? filename;
  return { updated, actualName };
}

async function removeFile(recordId, filename) {
  const fd = new FormData();
  fd.append("files-", filename);
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH", headers: { Authorization: TOKEN }, body: fd,
  });
  if (!r.ok) throw new Error(`remove ${filename}: ${r.status}`);
}

async function updateJson(recordId, newJson) {
  const r = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ json: newJson }),
  });
  if (!r.ok) throw new Error(`updateJson: ${r.status} ${await r.text()}`);
}

// ── Convertir con ffmpeg ───────────────────────────────────────────────────────
function convert(inputPath, outputPath) {
  // H.264 + AAC, compatible con Chrome/Firefox/Safari
  // -movflags +faststart → optimizado para streaming web
  execSync(
    `ffmpeg -y -i "${inputPath}" -vcodec libx264 -preset fast -crf 22 -acodec aac -movflags +faststart "${outputPath}"`,
    { stdio: "inherit" }
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  console.log("🎬 convert-videos.mjs\n");

  if (existsSync(TMP)) rmSync(TMP, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const all = await getAll();
  const courses = all.filter(r => !r.json?.type || r.json.type === "course");
  console.log(`Cursos encontrados: ${courses.length}`);

  let totalConverted = 0;

  for (const course of courses) {
    const videos = course.json?.videos ?? [];
    const toConvert = videos.filter(v => UNSUPPORTED.has((v.file.split(".").pop() ?? "").toLowerCase()));
    if (!toConvert.length) continue;

    console.log(`\n📁 Curso: ${course.title} (${course.id})`);
    console.log(`   ${toConvert.length} vídeo(s) a convertir`);

    for (const video of toConvert) {
      const ext = video.file.split(".").pop().toLowerCase();
      const baseName = video.file.replace(new RegExp(`\\.${ext}$`, "i"), "");
      const inputPath  = join(TMP, video.file);
      const outputName = `${baseName}.mp4`;
      const outputPath = join(TMP, outputName);

      console.log(`\n  ⬇  Descargando ${video.file}…`);
      await downloadFile(course.id, video.file, inputPath);

      console.log(`  🔄 Convirtiendo a MP4 H.264…`);
      convert(inputPath, outputPath);

      console.log(`  ⬆  Subiendo ${outputName}…`);
      const { actualName } = await uploadFile(course.id, outputPath, outputName);
      console.log(`     → guardado como: ${actualName}`);

      // Re-fetch latest record para no pisarle cambios a otros campos
      const latest = await getRecord(course.id);
      const updatedVideos = (latest.json?.videos ?? []).map(v2 =>
        v2.file === video.file ? { ...v2, file: actualName } : v2
      );
      await updateJson(course.id, { ...latest.json, videos: updatedVideos });
      console.log(`  ✏  JSON actualizado`);

      console.log(`  🗑  Borrando ${video.file} de PocketBase…`);
      await removeFile(course.id, video.file);

      // Limpiar temporales
      rmSync(inputPath, { force: true });
      rmSync(outputPath, { force: true });

      totalConverted++;
      console.log(`  ✅ Listo`);
    }
  }

  rmSync(TMP, { recursive: true, force: true });

  if (totalConverted === 0) {
    console.log("\n✅ No se encontraron vídeos en formatos problemáticos. Todo ok.");
  } else {
    console.log(`\n✅ ${totalConverted} vídeo(s) convertidos y actualizados.`);
  }
})();
