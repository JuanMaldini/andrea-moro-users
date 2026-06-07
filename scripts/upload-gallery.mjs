/**
 * upload-gallery.mjs
 *
 * Sube las imágenes de galería y "Andrea en acción" a PocketBase,
 * creando los records si no existen aún.
 *
 * Ejecutar desde la raíz de andrea-moro-users:
 *   node scripts/upload-gallery.mjs
 *
 * Requiere: .env con PB_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 *           y NEXT_PUBLIC_PB_DATA (opcional, default: andreamoro_data)
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, resolve } from "path";
import { createRequire } from "module";

// ── Leer .env manualmente ──────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!existsSync(envPath)) {
  console.error("No se encontró .env en:", envPath);
  process.exit(1);
}
const envContent = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const PB_URL     = (env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");
const TOKEN      = env.PB_ADMIN_TOKEN ?? "";
const COLLECTION = env.NEXT_PUBLIC_PB_DATA ?? "andreamoro_data";

if (!PB_URL || !TOKEN) {
  console.error("Faltan variables en .env: NEXT_PUBLIC_PB_URL, PB_ADMIN_TOKEN");
  process.exit(1);
}

// ── Rutas de las imágenes (relativo a este script, en andrea-moro-users) ──
// Ajustar si tu estructura de carpetas es diferente.
const ANDREA_MORO_PUBLIC = resolve(
  new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
  "andrea-moro",
  "public",
  "images"
);

const GALLERY_DIRS = [
  join(ANDREA_MORO_PUBLIC, "gallery", "book01"),
  join(ANDREA_MORO_PUBLIC, "gallery"),
];
const ANDREA_DIR = join(ANDREA_MORO_PUBLIC, "andrea");

// Extensiones de imagen aceptadas
const IMG_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".avif"]);

function listImages(dir) {
  if (!existsSync(dir)) {
    console.warn("  ⚠ directorio no encontrado:", dir);
    return [];
  }
  return readdirSync(dir)
    .filter((f) => IMG_EXTS.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile())
    .map((f) => join(dir, f));
}

// ── CRUD básico ────────────────────────────────────────────────────
async function getAllRecords(token) {
  const res = await fetch(
    `${PB_URL}/api/collections/${COLLECTION}/records?perPage=200`,
    { headers: { Authorization: token } }
  );
  if (!res.ok) throw new Error(`getAll failed: ${res.status}`);
  const data = await res.json();
  return data.items ?? [];
}

async function createRecord(token, body) {
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteRecord(token, id) {
  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records/${id}`, {
    method: "DELETE",
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status} ${await res.text()}`);
}

async function uploadFile(token, recordId, filePath) {
  const filename = filePath.split(/[/\\]/).pop();
  const ext = extname(filename).slice(1).toLowerCase();
  const mime = ext === "webp" ? "image/webp"
             : ext === "png"  ? "image/png"
             : ext === "avif" ? "image/avif"
             : "image/jpeg";

  const data = readFileSync(filePath);
  const fd = new FormData();
  fd.append("files+", new Blob([data], { type: mime }), filename);

  const res = await fetch(
    `${PB_URL}/api/collections/${COLLECTION}/records/${recordId}`,
    { method: "PATCH", headers: { Authorization: token }, body: fd }
  );
  if (!res.ok) {
    const txt = await res.text();
    console.error(`  ✗ ${filename}: ${res.status} ${txt}`);
    return false;
  }
  return true;
}

// ── Main ───────────────────────────────────────────────────────────
(async () => {
  console.log("🌸 upload-gallery.mjs\n");
  console.log("PocketBase:", PB_URL);
  console.log("Colección: ", COLLECTION);
  console.log("Carpeta:   ", ANDREA_MORO_PUBLIC, "\n");

  // 1. Usar token del .env
  const token = TOKEN;
  console.log("✅ Usando PB_ADMIN_TOKEN del .env\n");

  // 2. Fetch todos los records
  const all = await getAllRecords(token);
  let galleryRec = all.find((r) => r.json?.type === "gallery") ?? null;
  let andreaRec  = all.find((r) => r.json?.type === "andrea")  ?? null;

  // 3. Limpiar records existentes (borrar → recrear limpio)
  if (galleryRec) {
    console.log(`Borrando record gallery existente (${(galleryRec.files ?? []).length} archivos)…`);
    await deleteRecord(token, galleryRec.id);
  }
  console.log("Creando record gallery…");
  galleryRec = await createRecord(token, { title: "__gallery__", json: { type: "gallery" } });
  console.log("  id:", galleryRec.id);

  if (andreaRec) {
    console.log(`Borrando record andrea existente (${(andreaRec.files ?? []).length} archivos)…`);
    await deleteRecord(token, andreaRec.id);
  }
  console.log("Creando record andrea…");
  andreaRec = await createRecord(token, { title: "__andrea__", json: { type: "andrea" } });
  console.log("  id:", andreaRec.id, "\n");

  // 4. Recolectar imágenes
  const galleryFiles = GALLERY_DIRS.flatMap(listImages);
  const andreaFiles  = listImages(ANDREA_DIR);

  console.log(`\nImágenes galería: ${galleryFiles.length}`);
  console.log(`Imágenes andrea:  ${andreaFiles.length}\n`);

  if (galleryFiles.length === 0 && andreaFiles.length === 0) {
    console.warn("⚠ No se encontraron imágenes. Verificá las rutas.");
    console.warn("  Galería dirs:", GALLERY_DIRS);
    console.warn("  Andrea dir:  ", ANDREA_DIR);
    process.exit(0);
  }

  // 5. Subir galería
  if (galleryFiles.length) {
    console.log("📷 Subiendo galería…");
    let ok = 0;
    for (const fp of galleryFiles) {
      const name = fp.split(/[/\\]/).pop();
      process.stdout.write(`  ${name} … `);
      const success = await uploadFile(token, galleryRec.id, fp);
      if (success) { ok++; console.log("✓"); }
    }
    console.log(`  ${ok}/${galleryFiles.length} subidas\n`);
  }

  // 6. Subir andrea
  if (andreaFiles.length) {
    console.log("📷 Subiendo andrea en acción…");
    let ok = 0;
    for (const fp of andreaFiles) {
      const name = fp.split(/[/\\]/).pop();
      process.stdout.write(`  ${name} … `);
      const success = await uploadFile(token, andreaRec.id, fp);
      if (success) { ok++; console.log("✓"); }
    }
    console.log(`  ${ok}/${andreaFiles.length} subidas\n`);
  }

  console.log("✅ Migración completa.");
})();
