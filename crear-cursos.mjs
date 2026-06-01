// Script para crear los 10 cursos en PocketBase
// Ejecutar con: node crear-cursos.mjs

const PB_URL = "https://pocketbase.vmoliver.cloud";
const COLLECTION = "andreamoro_data";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjb2xsZWN0aW9uSWQiOiJwYmNfMzE0MjYzNTgyMyIsImV4cCI6MTc3NTM1MzQyNiwiaWQiOiI1ejhnM204OTZwM3gydWMiLCJyZWZyZXNoYWJsZSI6ZmFsc2UsInR5cGUiOiJhdXRoIn0.KCYeMI3yAqkjP3wUvmr4OFIdKYJWez6U-5J6UWl_Y0A";

function generateToken() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return hex() + hex() + hex() + hex();
}

const cursos = [
  { title: "Begonias",                          slug: "begonias" },
  { title: "Hojas en Ramas",                    slug: "hojas-en-ramas" },
  { title: "Flores para Difusor y Grandotas",   slug: "flores-para-difusor-y-grandotas" },
  { title: "Jazmines y Cariñosas",              slug: "jazmines-y-carinosas" },
  { title: "Reales Peonías",                    slug: "reales-peonias" },
  { title: "Reales Gladiolos",                  slug: "reales-gladiolos" },
  { title: "Mis Lirios",                        slug: "mis-lirios" },
  { title: "Reales Marimoñas",                  slug: "reales-marimonas" },
  { title: "Reales Magnolias y Clavelinas",     slug: "reales-magnolias-y-clavelinas" },
  { title: "Reales Escocias",                   slug: "reales-escocias" },
];

async function crear(curso) {
  const body = {
    title: curso.title,
    description: "",
    json: {
      published: false,
      slug: curso.slug,
      token: generateToken(),
      keys: ["passamt"],
      videos: [],
      gallery: [],
    },
  };

  const res = await fetch(`${PB_URL}/api/collections/${COLLECTION}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  console.log(`Creando ${cursos.length} cursos...\n`);
  for (const curso of cursos) {
    try {
      const rec = await crear(curso);
      console.log(`✓  ${curso.title.padEnd(40)} id: ${rec.id}  slug: ${curso.slug}`);
    } catch (err) {
      console.error(`✗  ${curso.title}: ${err.message}`);
    }
  }
  console.log("\nListo.");
}

main();
