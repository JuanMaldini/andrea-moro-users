// Ejecutar con: node publish-all.mjs
// Requiere que PB_ADMIN_TOKEN esté en .env o pégalo directamente abajo

import { readFileSync } from "fs";

// Lee el token del .env
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const TOKEN = env.PB_ADMIN_TOKEN;
const BASE = env.NEXT_PUBLIC_PB_URL?.replace(/\/$/, "") ?? "https://pocketbase.vmoliver.cloud";
const COLLECTION = env.NEXT_PUBLIC_PB_DATA ?? "andreamoro_data";

if (!TOKEN) {
  console.error("No PB_ADMIN_TOKEN en .env");
  process.exit(1);
}

// Obtener todos los cursos
const res = await fetch(`${BASE}/api/collections/${COLLECTION}/records?perPage=200`, {
  headers: { Authorization: TOKEN },
});
const { items } = await res.json();

if (!items?.length) {
  console.error("No se encontraron cursos o error de autenticación");
  process.exit(1);
}

console.log(`Publicando ${items.length} cursos...`);

const ADD_KEYS = ["andimoro32@gmail.com"];

for (const course of items) {
  const existingKeys = course.json?.keys ?? [];
  const mergedKeys = [...new Set([...existingKeys, ...ADD_KEYS])];
  const updatedJson = { ...course.json, published: true, keys: mergedKeys };
  const patch = await fetch(`${BASE}/api/collections/${COLLECTION}/records/${course.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: TOKEN },
    body: JSON.stringify({ json: updatedJson }),
  });
  const result = await patch.json();
  const ok = result.json?.published === true;
  console.log(`${ok ? "✓" : "✗"} ${course.title} — claves: ${result.json?.keys?.join(", ")}`);
}

console.log("Listo.");
