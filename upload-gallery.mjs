/**
 * upload-gallery.mjs
 *
 * Sube las imágenes de cada curso desde andrea-moro/public/images/
 * a sus correspondientes cursos en PocketBase (andrea-moro-users).
 *
 * Uso: node upload-gallery.mjs
 * Requisito: Node 18+ (usa fetch y FormData nativos). Node 24 ✓
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Configuración ────────────────────────────────────────────────────────────

const PB_URL        = "https://pocketbase.vmoliver.cloud";
const TOKEN         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJwYmNfMzE0MjYzNTgyMyIsImV4cCI6MTc3NTM1MzQyNiwiaWQiOiI1ejhnM204OTZwM3gydWMiLCJyZWZyZXNoYWJsZSI6ZmFsc2UsInR5cGUiOiJhdXRoIn0.KCYeMI3yAqkjP3wUvmr4OFIdKYJWez6U-5J6UWl_Y0A";
const COLLECTION    = "andreamoro_data";

// Ruta a las imágenes del repo andrea-moro (hermano de este directorio)
const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const IMGS_ROOT     = path.resolve(__dirname, "../andrea-moro/public/images");

// ── Mapeo: ID de PocketBase → imágenes (en el orden de mockup.ts) ────────────
//
// Las rutas son relativas a IMGS_ROOT (andrea-moro/public/images/).

const COURSES = [
  {
    id:   "8bvshges679o06c",
    name: "Begonias",
    imgs: [
      "Flores/begonia1.webp",
    ],
  },
  {
    id:   "sahl72hkk547p4h",
    name: "Hojas en Ramas",
    imgs: [
      "cursos/HojasEnRamas_01.webp",
      "cursos/HojasEnRamas_02.webp",
      "cursos/HojasEnRamas_03.webp",
      "cursos/HojasEnRamas_04.webp",
      "cursos/HojasEnRamas_05.webp",
      "cursos/HojasEnRamas_06.webp",
      "cursos/HojasEnRamas_07.webp",
      "cursos/HojasEnRamas_08.webp",
      "cursos/HojasEnRamas_09.webp",
      "cursos/HojasEnRamas_10.webp",
    ],
  },
  {
    id:   "3ajbluie94m8f98",
    name: "Flores para Difusor y Grandotas",
    imgs: [
      "Flores/Difusor simple.jpeg",
      "Flores/Grandota.jpeg",
    ],
  },
  {
    id:   "080hqphjpi3b95o",
    name: "Jazmines y Cariñosas",
    imgs: [
      "Flores/Jazmin.jpeg",
      "Flores/Carinosa.jpeg",
    ],
  },
  {
    id:   "dd9tddlztk1vful",
    name: "Reales Peonías",
    imgs: [
      "Flores/Peonia.jpeg",
      "Flores/Peonia2.jpeg",
      "Flores/Peonia3.jpeg",
    ],
  },
  {
    id:   "wqhrtzeehxwqjt8",
    name: "Reales Gladiolos",
    imgs: [
      "Flores/Gladiolo2.webp",
      "Flores/Gladiolo1.webp",
      "Flores/Gladiolo3.webp",
      "Flores/Gladiolo4.webp",
    ],
  },
  {
    id:   "zqidgs7cwl2v1ow",
    name: "Mis Lirios",
    imgs: [
      "Flores/Lirios1.webp",
      "Flores/Lirios2.webp",
      "Flores/Lirios3.webp",
      "Flores/Lirios4.webp",
    ],
  },
  {
    id:   "ko16u5s864jm4dz",
    name: "Reales Marimoñas",
    imgs: [
      "Flores/Marimonas1.webp",
      "Flores/Marimonas2.webp",
      "Flores/Marimonas3.webp",
      "Flores/Marimonas4.webp",
    ],
  },
  {
    id:   "4dv5acmp9geowfm",
    name: "Reales Magnolias y Clavelinas",
    imgs: [
      "Flores/Magnolia.jpeg",
      "Flores/Clavelina.jpeg",
    ],
  },
  {
    id:   "ki7z3om2acfygg2",
    name: "Reales Escocias",
    imgs: [
      "Flores/Escocias1.webp",
      "Flores/Escocias2.webp",
      "Flores/Escocias3.webp",
      "Flores/Escocias4.webp",
    ],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const MIME = {
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".jpg":  "image/jpeg",
  ".png":  "image/png",
};

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

async function pbGet(id) {
  const res = await fetch(
    `${PB_URL}/api/collections/${COLLECTION}/records/${id}`,
    { headers: { Authorization: TOKEN } }
  );
  if (!res.ok) throw new Error(`GET ${id} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** Sube UN archivo usando files+ (append). Devuelve el record actualizado. */
async function pbUploadFile(id, filePath) {
  const buffer   = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const blob     = new Blob([buffer], { type: mimeFor(filePath) });

  const form = new FormData();
  form.append("files+", blob, filename);

  const res = await fetch(
    `${PB_URL}/api/collections/${COLLECTION}/records/${id}`,
    { method: "PATCH", headers: { Authorization: TOKEN }, body: form }
  );
  if (!res.ok) throw new Error(`UPLOAD ${filename} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** Actualiza solo json.gallery del record, sin tocar el resto del JSON. */
async function pbSetGallery(id, galleryFilenames) {
  const record  = await pbGet(id);
  const newJson = { ...record.json, gallery: galleryFilenames };

  const res = await fetch(
    `${PB_URL}/api/collections/${COLLECTION}/records/${id}`,
    {
      method:  "PATCH",
      headers: { Authorization: TOKEN, "Content-Type": "application/json" },
      body:    JSON.stringify({ json: newJson }),
    }
  );
  if (!res.ok) throw new Error(`SET_GALLERY ${id} → ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌸  Iniciando subida de galerías a PocketBase\n");

  let totalUploaded = 0;
  let totalErrors   = 0;

  for (const course of COURSES) {
    console.log(`📁  ${course.name} (${course.imgs.length} imagen${course.imgs.length !== 1 ? "es" : ""})`);

    // Estado inicial de files para poder hacer el diff después de cada subida
    const initial      = await pbGet(course.id);
    let knownFiles     = new Set(initial.files ?? []);
    const newFilenames = [];

    for (const imgRel of course.imgs) {
      const fullPath = path.join(IMGS_ROOT, imgRel);

      if (!fs.existsSync(fullPath)) {
        console.log(`   ⚠  No encontrado: ${imgRel}`);
        totalErrors++;
        continue;
      }

      try {
        const updated  = await pbUploadFile(course.id, fullPath);
        const allFiles = updated.files ?? [];

        // El nombre real que asignó PocketBase = los que antes no existían
        const added = allFiles.filter((f) => !knownFiles.has(f));
        added.forEach((f) => knownFiles.add(f));
        newFilenames.push(...added);

        const pbName = added[0] ?? "(nombre no detectado)";
        console.log(`   ✓  ${path.basename(imgRel)}  →  ${pbName}`);
        totalUploaded++;
      } catch (err) {
        console.log(`   ✗  ${path.basename(imgRel)}  →  ${err.message}`);
        totalErrors++;
      }
    }

    // Guardar la galería en json.gallery
    if (newFilenames.length > 0) {
      await pbSetGallery(course.id, newFilenames);
      console.log(`   💾  json.gallery guardado (${newFilenames.length} entrada${newFilenames.length !== 1 ? "s" : ""})\n`);
    } else {
      console.log(`   ⚠  Sin imágenes nuevas para guardar en gallery\n`);
    }
  }

  console.log("─".repeat(50));
  console.log(`✅  Subidas: ${totalUploaded}   ❌  Errores: ${totalErrors}`);
  console.log("\nTodos los cursos deberían mostrar ya su galería en cursos.andreamorotienda.com");
}

main().catch((err) => {
  console.error("\n💥  Error fatal:", err.message);
  process.exit(1);
});
