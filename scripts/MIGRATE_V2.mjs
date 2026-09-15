/**
 * MIGRATE_V2.mjs
 *
 * Migra andreamoro_data (1 colección con json + campo files) a:
 *   andreamoro_courses  — 1 record por curso (MISMO id, slug y token)
 *   andreamoro_videos   — 1 record por vídeo
 *   andreamoro_media    — recursos, galería de curso y galerías del sitio
 * y ajusta las API rules de andreamoro_user (registro cerrado).
 *
 * - Por defecto es SIMULACIÓN: solo lee e informa. Con --apply ejecuta.
 * - Idempotente: si se corta, se vuelve a correr y salta lo ya migrado.
 * - NUNCA escribe ni borra nada en andreamoro_data (queda de backup).
 * - Verifica bytes de cada archivo copiado.
 *
 * Requiere en .env (solo local):
 *   NEXT_PUBLIC_PB_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD
 *
 * Uso:
 *   node scripts\MIGRATE_V2.mjs            (simulación)
 *   node scripts\MIGRATE_V2.mjs --apply    (ejecuta)
 */

import { readFileSync, mkdirSync, rmSync, existsSync, writeFileSync, appendFileSync, statSync, openAsBlob } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { join } from "path";

const APPLY = process.argv.includes("--apply");

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!existsSync(envPath)) { console.error("No se encontró .env"); process.exit(1); }
const envContent = readFileSync(envPath, "utf-8");
function envVal(key) {
  const m = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}
const PB_URL   = envVal("NEXT_PUBLIC_PB_URL").replace(/\/$/, "");
const SU_EMAIL = envVal("PB_SUPERUSER_EMAIL");
const SU_PASS  = envVal("PB_SUPERUSER_PASSWORD");
const OLD      = envVal("NEXT_PUBLIC_PB_DATA") || "andreamoro_data";
const USERS    = envVal("NEXT_PUBLIC_PB_USERS") || "andreamoro_user";
const COURSES  = "andreamoro_courses";
const VIDEOS   = "andreamoro_videos";
const MEDIA    = "andreamoro_media";
if (!PB_URL || !SU_EMAIL || !SU_PASS) {
  console.error("Faltan NEXT_PUBLIC_PB_URL, PB_SUPERUSER_EMAIL o PB_SUPERUSER_PASSWORD en .env");
  process.exit(1);
}

// ── Logs ──────────────────────────────────────────────────────────────────
const LOG_DIR = join(import.meta.dirname, "_logs");
mkdirSync(LOG_DIR, { recursive: true });
const logFile = join(LOG_DIR, `migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
writeFileSync(logFile, "");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(logFile, line);
  process.stdout.write(line);
}

const TMP = join(import.meta.dirname, "_tmp_migrate");

// ── API ───────────────────────────────────────────────────────────────────
let TOKEN = "";
async function api(method, path, body, isForm) {
  const opts = { method, headers: TOKEN ? { Authorization: TOKEN } : {} };
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(`${PB_URL}/api/${path}`, opts);
  const text = await r.text();
  if (!r.ok) {
    const err = new Error(`${method} /api/${path} → HTTP ${r.status}\n${text}`);
    err.status = r.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}
const q = (s) => encodeURIComponent(s);

async function getCollection(name) {
  try { return await api("GET", `collections/${name}`); }
  catch (e) { if (e.status === 404) return null; throw e; }
}

async function listAll(collection, filter = "") {
  const out = [];
  for (let page = 1; ; page++) {
    const res = await api("GET", `collections/${collection}/records?perPage=500&page=${page}${filter ? `&filter=${q(filter)}` : ""}`);
    out.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return out;
}

// ── Esquema ───────────────────────────────────────────────────────────────
const ADMIN = `@request.auth.collectionName = "${USERS}"`;
const GB10 = 10 * 1024 * 1024 * 1024;
const autodates = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];

function coursesSchema() {
  return {
    name: COURSES, type: "base",
    listRule: `published = true || ${ADMIN}`,
    viewRule: `published = true || ${ADMIN}`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "title", type: "text", max: 500 },
      { name: "description", type: "text", max: 100000 },
      { name: "price", type: "number", min: 0 },
      { name: "slug", type: "text", required: true, max: 200, pattern: "^[a-z0-9-]+$" },
      { name: "token", type: "text", required: true, min: 8, max: 8, pattern: "^[0-9a-f]{8}$" },
      { name: "published", type: "bool" },
      ...autodates,
    ],
    indexes: [`CREATE UNIQUE INDEX idx_${COURSES}_slug ON ${COURSES} (slug)`],
  };
}

function videosSchema(coursesId) {
  return {
    name: VIDEOS, type: "base",
    listRule: `course.published = true || ${ADMIN}`,
    viewRule: `course.published = true || ${ADMIN}`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "course", type: "relation", required: true, collectionId: coursesId, cascadeDelete: true, maxSelect: 1 },
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: GB10 },
      { name: "name", type: "text", max: 500 },
      { name: "order", type: "number", min: 0 },
      ...autodates,
    ],
    indexes: [`CREATE INDEX idx_${VIDEOS}_course_order ON ${VIDEOS} (course, "order")`],
  };
}

function mediaSchema(coursesId) {
  return {
    name: MEDIA, type: "base",
    listRule: `course = "" || course.published = true || ${ADMIN}`,
    viewRule: `course = "" || course.published = true || ${ADMIN}`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "course", type: "relation", required: false, collectionId: coursesId, cascadeDelete: true, maxSelect: 1 },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["resource", "gallery", "site_gallery", "site_andrea"] },
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: GB10 },
      { name: "name", type: "text", max: 500 },
      { name: "original", type: "text", max: 500 },
      { name: "order", type: "number", min: 0 },
      ...autodates,
    ],
    indexes: [`CREATE INDEX idx_${MEDIA}_course_kind_order ON ${MEDIA} (course, kind, "order")`],
  };
}

// ── Utilidades ────────────────────────────────────────────────────────────
function slugify(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
}
function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stripExt(name) { const i = name.lastIndexOf("."); return i > 0 ? name.slice(0, i) : name; }
/** "begonias_1_9ijynp3hub_conv_yxjvwa5st9.mp4" → "begonias_1.mp4" (PocketBase agrega su propio sufijo). */
function cleanFileName(stored) {
  const i = stored.lastIndexOf(".");
  const ext = i > 0 ? stored.slice(i) : "";
  let base = i > 0 ? stored.slice(0, i) : stored;
  for (;;) {
    const next = base.replace(/_conv$/, "").replace(/_[a-z0-9]{10}$/, "");
    if (next === base) break;
    base = next;
  }
  return (base || "file") + ext.toLowerCase();
}
function mimeFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  return ({
    mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    avif: "image/avif", pdf: "application/pdf",
  })[ext] ?? "application/octet-stream";
}

const stats = { courses: 0, videos: 0, media: 0, skipped: 0, missing: 0, orphans: 0, bytes: 0 };

/** Descarga (streaming) un archivo del record viejo a disco. Devuelve ruta y bytes, o null si 404. */
async function download(recordId, filename) {
  const url = `${PB_URL}/api/files/${OLD}/${recordId}/${q(filename)}`;
  const r = await fetch(url, { headers: { Authorization: TOKEN } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`descarga ${filename} → HTTP ${r.status}`);
  mkdirSync(TMP, { recursive: true });
  const path = join(TMP, filename);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(path));
  return { path, size: statSync(path).size };
}

/** Crea un record con archivo (streaming desde disco) y verifica bytes. */
async function createWithFile(collection, fields, local, uploadName) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const blob = await openAsBlob(local.path, { type: mimeFor(uploadName) });
  fd.append("file", blob, uploadName);
  const rec = await api("POST", `collections/${collection}/records`, fd, true);
  const head = await fetch(`${PB_URL}/api/files/${collection}/${rec.id}/${q(rec.file)}`, { method: "HEAD", headers: { Authorization: TOKEN } });
  const remoteSize = Number(head.headers.get("content-length") ?? -1);
  if (remoteSize !== local.size) {
    throw new Error(`Verificación fallida ${collection}/${rec.id}: local ${local.size} bytes vs remoto ${remoteSize}`);
  }
  return rec;
}

/** Copia un archivo del record viejo a un record nuevo (o simula). */
async function copyFile({ oldRecordId, filename, collection, fields, exists, label }) {
  if (exists) { log(`  SKIP (ya migrado) ${label}`); stats.skipped++; return; }
  if (!APPLY) { log(`  [sim] ${label} ← ${filename}`); return "sim"; }
  const local = await download(oldRecordId, filename);
  if (!local) { log(`  ⚠ FALTA en PocketBase (404): ${filename} — no se migra`); stats.missing++; return; }
  const rec = await createWithFile(collection, fields, local, cleanFileName(filename));
  rmSync(local.path, { force: true });
  stats.bytes += local.size;
  log(`  OK ${label} → ${collection}/${rec.id} (${(local.size / 1048576).toFixed(1)} MB, bytes verificados)`);
  return rec;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log(`=== MIGRATE V2 — ${APPLY ? "APLICANDO" : "SIMULACIÓN (usar --apply para ejecutar)"} ===`);

  const auth = await api("POST", "collections/_superusers/auth-with-password", { identity: SU_EMAIL, password: SU_PASS });
  TOKEN = auth.token;
  log("Superuser autenticado.");

  // 0. Usuarios
  const users = await listAll(USERS);
  log(`${USERS}: ${users.length} usuario(s): ${users.map((u) => u.email || u.id).join(", ")}`);

  // 1. Colecciones
  let courses = await getCollection(COURSES);
  let videos = await getCollection(VIDEOS);
  let media = await getCollection(MEDIA);
  log(`Colecciones: ${COURSES}=${courses ? "existe" : "crear"} · ${VIDEOS}=${videos ? "existe" : "crear"} · ${MEDIA}=${media ? "existe" : "crear"}`);

  const usersCol = await getCollection(USERS);
  log(`Rules actuales ${USERS}: list=${JSON.stringify(usersCol.listRule)} view=${JSON.stringify(usersCol.viewRule)} create=${JSON.stringify(usersCol.createRule)} update=${JSON.stringify(usersCol.updateRule)} delete=${JSON.stringify(usersCol.deleteRule)}`);

  if (APPLY) {
    if (!courses) courses = await api("POST", "collections", coursesSchema());
    if (!videos) videos = await api("POST", "collections", videosSchema(courses.id));
    if (!media) media = await api("POST", "collections", mediaSchema(courses.id));
    await api("PATCH", `collections/${USERS}`, {
      listRule: "id = @request.auth.id",
      viewRule: "id = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    log("Colecciones listas y registro de usuarios cerrado.");
  }

  // 2. Datos viejos
  const old = await listAll(OLD);
  const oldCourses = old.filter((r) => !r.json?.type || r.json.type === "course");
  const oldSite = old.filter((r) => r.json?.type === "gallery" || r.json?.type === "andrea");
  log(`${OLD}: ${old.length} records (${oldCourses.length} cursos, ${oldSite.length} galerías del sitio)`);

  const newCourses = courses ? await listAll(COURSES) : [];
  const newVideos = videos ? await listAll(VIDEOS) : [];
  const newMedia = media ? await listAll(MEDIA) : [];
  const courseIds = new Set(newCourses.map((c) => c.id));
  // Slugs ya tomados por OTROS cursos (el propio curso, si ya migró, no cuenta).
  const usedSlugs = new Set();

  for (const oc of oldCourses) {
    const j = oc.json ?? {};
    let slug = j.slug;
    let token = j.token;
    const migrated = newCourses.find((c) => c.id === oc.id);
    if (migrated) { slug = migrated.slug; token = migrated.token; }
    const linkOk = typeof slug === "string" && /^[a-z0-9-]+$/.test(slug) && /^[0-9a-f]{8}$/.test(token ?? "");
    if (!migrated && linkOk && usedSlugs.has(slug)) {
      // Slug duplicado: el link viejo ya abría el OTRO curso (results[0]), este nunca funcionó.
      const base = slug; let n = 2; while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      log(`⚠ "${oc.title}" (${oc.id}) tenía slug duplicado "${base}" → nuevo /${slug}_${token}`);
    } else if (!linkOk) {
      const base = slugify(slug || oc.title) || oc.id.toLowerCase();
      slug = base; let n = 2; while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      token = /^[0-9a-f]{8}$/.test(token ?? "") ? token : randomToken();
      log(`⚠ "${oc.title}" (${oc.id}) no tenía link válido (slug=${j.slug}, token=${j.token}) → nuevo /${slug}_${token}`);
    }
    usedSlugs.add(slug);

    log(`\n=== ${oc.title} (${oc.id}) /${slug}_${token} ===`);
    if (courseIds.has(oc.id)) {
      log("  SKIP curso (ya migrado)"); stats.skipped++;
    } else if (APPLY) {
      await api("POST", `collections/${COURSES}/records`, {
        id: oc.id, title: oc.title ?? "", description: oc.description ?? "",
        price: oc.price ?? 0, slug, token, published: j.published === true,
      });
      stats.courses++;
      log("  OK curso");
    } else {
      log(`  [sim] curso price=${oc.price ?? 0} published=${j.published === true}`);
    }

    const referenced = new Set();

    const vids = [...(j.videos ?? [])].sort((a, b) => a.order - b.order);
    for (let i = 0; i < vids.length; i++) {
      const v = vids[i]; const order = i + 1; referenced.add(v.file);
      const r = await copyFile({
        oldRecordId: oc.id, filename: v.file, collection: VIDEOS,
        fields: { course: oc.id, name: v.name ?? `${slug}_${order}`, order },
        exists: newVideos.some((x) => x.course === oc.id && x.order === order),
        label: `vídeo ${order} "${v.name}"`,
      });
      if (r && r !== "sim") stats.videos++;
    }

    const resources = [...(j.resources ?? [])].sort((a, b) => a.order - b.order);
    for (let i = 0; i < resources.length; i++) {
      const res = resources[i]; const order = i + 1; referenced.add(res.file);
      const r = await copyFile({
        oldRecordId: oc.id, filename: res.file, collection: MEDIA,
        fields: { course: oc.id, kind: "resource", name: res.name ?? stripExt(res.original ?? res.file), original: res.original ?? res.file, order },
        exists: newMedia.some((x) => x.course === oc.id && x.kind === "resource" && x.order === order),
        label: `recurso ${order} "${res.name}"`,
      });
      if (r && r !== "sim") stats.media++;
    }

    const gallery = j.gallery ?? [];
    for (let i = 0; i < gallery.length; i++) {
      const f = gallery[i]; const order = i + 1; referenced.add(f);
      const r = await copyFile({
        oldRecordId: oc.id, filename: f, collection: MEDIA,
        fields: { course: oc.id, kind: "gallery", name: stripExt(cleanFileName(f)), original: f, order },
        exists: newMedia.some((x) => x.course === oc.id && x.kind === "gallery" && x.order === order),
        label: `foto ${order}`,
      });
      if (r && r !== "sim") stats.media++;
    }

    const orphans = (oc.files ?? []).filter((f) => !referenced.has(f));
    if (orphans.length) {
      stats.orphans += orphans.length;
      log(`  ℹ ${orphans.length} archivo(s) sin referencia en json (no se migran, siguen en ${OLD}): ${orphans.join(", ")}`);
    }
  }

  for (const site of oldSite) {
    const kind = site.json.type === "gallery" ? "site_gallery" : "site_andrea";
    log(`\n=== Galería del sitio: ${kind} (${site.id}) ===`);
    const files = site.files ?? [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; const order = i + 1;
      const r = await copyFile({
        oldRecordId: site.id, filename: f, collection: MEDIA,
        fields: { kind, name: stripExt(cleanFileName(f)), original: f, order },
        exists: newMedia.some((x) => !x.course && x.kind === kind && x.order === order),
        label: `${kind} ${order}`,
      });
      if (r && r !== "sim") stats.media++;
    }
  }

  // 3. Verificación de conteos
  if (APPLY) {
    log("\n=== Verificación ===");
    const [c2, v2, m2] = await Promise.all([listAll(COURSES), listAll(VIDEOS), listAll(MEDIA)]);
    let ok = true;
    for (const oc of oldCourses) {
      const j = oc.json ?? {};
      const nv = v2.filter((v) => v.course === oc.id).length;
      const nr = m2.filter((m) => m.course === oc.id && m.kind === "resource").length;
      const ng = m2.filter((m) => m.course === oc.id && m.kind === "gallery").length;
      const ev = (j.videos ?? []).length, er = (j.resources ?? []).length, eg = (j.gallery ?? []).length;
      const good = c2.some((c) => c.id === oc.id) && nv === ev && nr === er && ng === eg;
      if (!good) ok = false;
      log(`${good ? "✓" : "✗"} ${oc.title}: vídeos ${nv}/${ev} · recursos ${nr}/${er} · fotos ${ng}/${eg}`);
    }
    for (const site of oldSite) {
      const kind = site.json.type === "gallery" ? "site_gallery" : "site_andrea";
      const n = m2.filter((m) => m.kind === kind).length, e = (site.files ?? []).length;
      if (n !== e) ok = false;
      log(`${n === e ? "✓" : "✗"} ${kind}: ${n}/${e}`);
    }
    log(ok ? "\nTODO COINCIDE." : "\n⚠ HAY DIFERENCIAS (ver arriba; si hubo 404 es esperable). Se puede volver a correr.");
  }

  rmSync(TMP, { recursive: true, force: true });
  log(`\n=== FIN ===`);
  log(`Cursos creados: ${stats.courses} · vídeos: ${stats.videos} · media: ${stats.media} · saltados: ${stats.skipped} · faltantes: ${stats.missing} · huérfanos: ${stats.orphans} · ${(stats.bytes / 1073741824).toFixed(2)} GB copiados`);
  log(`Log: ${logFile}`);
}

main().catch((err) => {
  log(`\n❌ ERROR: ${err.message}`);
  log(`Stack: ${err.stack}`);
  process.exit(1);
});
