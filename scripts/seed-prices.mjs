/**
 * seed-prices.mjs
 *
 * Carga los cursos desde PocketBase y actualiza el campo `price`
 * según los precios originales del mockup de andrea-moro.
 *
 * Uso (desde la raíz de andrea-moro-users):
 *   node scripts/seed-prices.mjs
 */

import PocketBase from "pocketbase";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Leer .env manualmente (sin dotenv) ─────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const envVars = {};
try {
  readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      if (key && rest.length) envVars[key.trim()] = rest.join("=").trim();
    });
} catch {
  console.error("No se pudo leer .env — asegurate de ejecutar desde la raíz del proyecto.");
  process.exit(1);
}

const PB_URL = envVars["NEXT_PUBLIC_PB_URL"];
const PB_ADMIN_TOKEN = envVars["PB_ADMIN_TOKEN"];
const COLLECTION = envVars["NEXT_PUBLIC_PB_DATA"] || "andreamoro_data";

if (!PB_URL || !PB_ADMIN_TOKEN) {
  console.error("Faltan NEXT_PUBLIC_PB_URL o PB_ADMIN_TOKEN en el .env");
  process.exit(1);
}

// ── Precios del mockup original ────────────────────────────────────────────
const PRECIOS = [
  { titulo: "Begonias",                         precio: 20000 },
  { titulo: "Hojas en Ramas",                   precio: 18000 },
  { titulo: "Flores para Difusor y Grandotas",  precio: 13000 },
  { titulo: "Jazmines y Cariñosas",             precio: 15000 },
  { titulo: "Reales Peonías",                   precio: 19000 },
  { titulo: "Reales Gladiolos",                 precio: 19000 },
  { titulo: "Mis Lirios",                       precio: 20000 },
  { titulo: "Reales Marimoñas",                 precio: 22000 },
  { titulo: "Reales Magnolias y Clavelinas",    precio: 25000 },
  { titulo: "Reales Escocias",                  precio: 18000 },
];

// Normaliza texto para comparación flexible (sin tildes, minúsculas)
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
pb.authStore.save(PB_ADMIN_TOKEN, null);

console.log(`\nConectando a ${PB_URL} → colección "${COLLECTION}"...\n`);

const result = await pb.collection(COLLECTION).getFullList({ sort: "title" });
console.log(`Cursos encontrados en PocketBase: ${result.length}\n`);

let actualizados = 0;
let noEncontrados = [];

for (const record of result) {
  const normTitle = normalize(record.title || "");
  const match = PRECIOS.find((p) => normalize(p.titulo) === normTitle);

  if (match) {
    if (record.price === match.precio) {
      console.log(`  ✓ "${record.title}" ya tiene precio ${match.precio} — sin cambios`);
    } else {
      await pb.collection(COLLECTION).update(record.id, { price: match.precio });
      console.log(`  ✅ "${record.title}" → price = ${match.precio}`);
      actualizados++;
    }
  } else {
    console.log(`  ⚠️  "${record.title}" — sin match en el mockup`);
    noEncontrados.push(record.title);
  }
}

console.log(`\n── Resultado ──────────────────────────────────────`);
console.log(`  Actualizados: ${actualizados}`);
if (noEncontrados.length) {
  console.log(`  Sin match (revisar manualmente):`);
  noEncontrados.forEach((t) => console.log(`    - "${t}"`));
}
console.log(`───────────────────────────────────────────────────\n`);
