/**
 * fix-flores-nepal.mjs (v2)
 *
 * Reconstruye json.videos de Flores Nepal: para cada order 1..13
 * toma TODOS los .mp4 en files y se queda con el de hash mas alto
 * (lexicograficamente ultimo = subido mas recientemente).
 * Limpia json.gallery: solo los archivos que existen.
 */

import PocketBase from "pocketbase";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envVars = {};
readFileSync(resolve(__dirname, "../.env"), "utf-8")
  .split("\n")
  .forEach(l => {
    const [k, ...r] = l.split("=");
    if (k && r.length) envVars[k.trim()] = r.join("=").trim();
  });

const pb = new PocketBase(envVars["NEXT_PUBLIC_PB_URL"].replace(/\/$/, ""));
pb.autoCancellation(false);
pb.authStore.save(envVars["PB_ADMIN_TOKEN"], null);

const flores = await pb.collection("andreamoro_data").getFirstListItem(`json.slug = "flores-nepal"`);
console.log(`Flores Nepal: id=${flores.id}\n`);

// Agrupar mp4s por order
const byOrder = {};
for (const f of flores.files) {
  const m = f.match(/^flores_nepal_(\d+)_[a-z0-9]+\.mp4$/);
  if (m) {
    const order = parseInt(m[1]);
    (byOrder[order] ??= []).push(f);
  }
}

const newVideos = [];
for (let order = 1; order <= 13; order++) {
  const files = (byOrder[order] ?? []).slice().sort();
  if (files.length === 0) {
    console.log(`  ${order}: NINGUNO (falta archivo!)`);
    continue;
  }
  // Tomar el lexicograficamente ULTIMO (asumimos hash mas alto = subido mas tarde)
  const picked = files[files.length - 1];
  console.log(`  ${order}: ${files.length} archivo(s) -> "${picked}"`);
  newVideos.push({ order, name: `flores-nepal_${order}`, file: picked });
}

const oldGallery = flores.json?.gallery ?? [];
const newGallery = oldGallery.filter(g => flores.files.includes(g));
const removedGallery = oldGallery.length - newGallery.length;
console.log(`\nGallery: ${oldGallery.length} -> ${newGallery.length} (${removedGallery} muertos sacados)`);

console.log(`\nActualizando...`);
await pb.collection("andreamoro_data").update(flores.id, {
  json: { ...flores.json, videos: newVideos, gallery: newGallery }
});
console.log(`OK\n`);

// Verificacion
const verify = await pb.collection("andreamoro_data").getOne(flores.id);
console.log(`--- VERIFICACION ---`);
console.log(`json.videos: ${verify.json.videos.length} entradas`);
for (const v of verify.json.videos) {
  const exists = verify.files.includes(v.file);
  console.log(`  ${v.order}  ${v.name.padEnd(15)}  ${v.file}  ${exists ? "OK" : "NO EXISTE"}`);
}
console.log(`\njson.gallery: ${verify.json.gallery.length} entradas`);
for (const g of verify.json.gallery) {
  const exists = verify.files.includes(g);
  console.log(`  ${g}  ${exists ? "OK" : "NO EXISTE"}`);
}
