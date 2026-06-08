/**
 * ensure-published.mjs
 *
 * Setea `json.published = true` en todos los cursos.
 * El flag ya no se usa: los cursos nacen y quedan publicados.
 *
 * Uso (desde la raíz de andrea-moro-users):
 *   node scripts/ensure-published.mjs
 */

import PocketBase from "pocketbase";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
  console.error("No se pudo leer .env");
  process.exit(1);
}

const PB_URL = envVars["NEXT_PUBLIC_PB_URL"];
const PB_ADMIN_TOKEN = envVars["PB_ADMIN_TOKEN"];
const COLLECTION = envVars["NEXT_PUBLIC_PB_DATA"] || "andreamoro_data";

if (!PB_URL || !PB_ADMIN_TOKEN) {
  console.error("Faltan NEXT_PUBLIC_PB_URL o PB_ADMIN_TOKEN en el .env");
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
pb.authStore.save(PB_ADMIN_TOKEN, null);

console.log(`\nConectando a ${PB_URL} → "${COLLECTION}"...\n`);

const records = await pb.collection(COLLECTION).getFullList({ sort: "title" });
console.log(`Records encontrados: ${records.length}\n`);

let modificados = 0;
let yaPublicados = 0;

for (const r of records) {
  if (r.json?.published === true) {
    console.log(`  ·  "${r.title}" — ya publicado, no se toca`);
    yaPublicados++;
  } else {
    const newJson = { ...r.json, published: true };
    await pb.collection(COLLECTION).update(r.id, { json: newJson });
    console.log(`  ✅ "${r.title}" — published → true`);
    modificados++;
  }
}

console.log(`\n── Resultado ────────────────────────────`);
console.log(`  Modificados:    ${modificados}`);
console.log(`  Ya publicados:  ${yaPublicados}`);
console.log(`─────────────────────────────────────────\n`);
