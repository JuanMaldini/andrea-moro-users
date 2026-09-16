/**
 * pb-video.mjs — utilidades compartidas por CONVERT_VIDEOS y UPLOAD_BATCH.
 *
 * - .env + login admin (email/contraseña, sin token fijo)
 * - API PocketBase, descarga/subida por streaming
 * - ffprobe (codecs, HDR, duración) y detección de faststart
 * - argumentos de ffmpeg: compatibilidad total SIN cambiar resolución, fps ni calidad perceptible
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync, createWriteStream, openAsBlob, statSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { join } from "path";

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = new URL("../../.env", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
export function envVal(key) {
  const m = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

export const PB_URL = envVal("NEXT_PUBLIC_PB_URL").replace(/\/$/, "");
export const USERS = envVal("NEXT_PUBLIC_PB_USERS") || "andreamoro_user";
export const COURSES = envVal("NEXT_PUBLIC_PB_COURSES") || "andreamoro_courses";
export const VIDEOS = envVal("NEXT_PUBLIC_PB_VIDEOS") || "andreamoro_videos";

// ── Logs ──────────────────────────────────────────────────────────────────
export function createLogger(prefix) {
  const dir = join(import.meta.dirname, "..", "_logs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  writeFileSync(file, "");
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    appendFileSync(file, line);
    process.stdout.write(line);
  };
  log.file = file;
  return log;
}

// ── Chequeo ffmpeg/ffprobe ────────────────────────────────────────────────
export function requireFfmpeg(log) {
  for (const bin of ["ffmpeg", "ffprobe"]) {
    try { execSync(`${bin} -version`, { stdio: "ignore" }); }
    catch { log(`${bin} no encontrado. Instalalo: winget install -e --id Gyan.FFmpeg`); process.exit(1); }
  }
}

// ── API ───────────────────────────────────────────────────────────────────
let TOKEN = "";

export async function api(method, path, body, isForm) {
  const opts = { method, headers: TOKEN ? { Authorization: TOKEN } : {} };
  if (body) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const r = await fetch(`${PB_URL}/api/${path}`, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} /api/${path} → HTTP ${r.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}

/** Login con la cuenta admin (PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD). Falla temprano y claro. */
export async function login(log) {
  const email = envVal("PB_ADMIN_EMAIL");
  const password = envVal("PB_ADMIN_PASSWORD");
  if (!PB_URL || !email || !password) {
    log("Faltan NEXT_PUBLIC_PB_URL, PB_ADMIN_EMAIL o PB_ADMIN_PASSWORD en .env");
    process.exit(1);
  }
  try {
    const auth = await api("POST", `collections/${USERS}/auth-with-password`, { identity: email, password });
    TOKEN = auth.token;
    log(`Sesión iniciada como ${email}`);
  } catch (e) {
    log(`No se pudo iniciar sesión (revisá PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD):\n${e.message}`);
    process.exit(1);
  }
}

export async function listAll(collection, params = {}) {
  const out = [];
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ perPage: "500", page: String(page), ...params });
    const res = await api("GET", `collections/${collection}/records?${qs}`);
    out.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return out;
}

export function videoFileUrl(rec) {
  return `${PB_URL}/api/files/${VIDEOS}/${rec.id}/${encodeURIComponent(rec.file)}`;
}

/** Descarga por streaming a disco (no carga el vídeo entero en memoria). */
export async function downloadTo(url, path) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga → HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(path));
  return statSync(path).size;
}

/** Crea un record de vídeo subiendo el archivo por streaming. */
export async function createVideoRecord(fields, localPath, uploadName) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append("file", await openAsBlob(localPath, { type: "video/mp4" }), uploadName);
  return api("POST", `collections/${VIDEOS}/records`, fd, true);
}

// ── Análisis ──────────────────────────────────────────────────────────────
/** Info de un input (ruta local o URL http): codecs, pix_fmt, transfer, duración. */
export function probe(input) {
  const r = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,pix_fmt,color_transfer:format=duration,format_name",
    "-of", "json",
    input,
  ]);
  let j = {};
  try { if (r.status === 0) j = JSON.parse(r.stdout?.toString() || "{}"); } catch { /* */ }
  const streams = j.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video") ?? {};
  const a = streams.find((s) => s.codec_type === "audio") ?? {};
  return {
    vCodec: v.codec_name ?? "",
    aCodec: a.codec_name ?? "",
    pixFmt: v.pix_fmt ?? "",
    transfer: v.color_transfer ?? "",
    duration: Number(j.format?.duration ?? 0),
    container: j.format?.format_name ?? "",
  };
}

export const isHdr = (info) => ["arib-std-b67", "smpte2084"].includes(info.transfer);

/** true si el átomo `moov` está antes de `mdat` (el vídeo empieza a reproducirse sin bajar todo). */
export async function hasFaststart(url) {
  const r = await fetch(url, { headers: { Range: "bytes=0-65535" } });
  if (!r.ok) return false;
  // A proxy may ignore Range and return the entire multi-GB file. Read only the prefix.
  if (!r.body) return false;
  const reader = r.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (length < 65536) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value.subarray(0, 65536 - length));
      chunks.push(chunk);
      length += chunk.length;
    }
  } finally {
    await reader.cancel();
  }
  const buf = Buffer.concat(chunks);
  let off = 0;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "moov") return true;
    if (type === "mdat") return false;
    if (size === 1 && off + 16 <= buf.length) size = Number(buf.readBigUInt64BE(off + 8));
    if (size < 8) return false;
    off += size;
  }
  return false; // no se encontró en los primeros 64 KB → moov al final
}

/**
 * Decide la acción:
 *  "skip"   h264 (+aac o sin audio), 8-bit, en mp4 con faststart
 *  "remux"  codecs OK pero falta faststart o contenedor no-mp4 → copia sin pérdida
 *  "encode" codec/bit-depth incompatible (HEVC, 10-bit, etc.)
 */
export function decide(info, { isMp4, faststart }) {
  const videoOk = info.vCodec === "h264" && !isHdr(info) && (info.pixFmt === "yuv420p" || info.pixFmt === "yuvj420p");
  const audioOk = info.aCodec === "" || info.aCodec === "aac";
  if (!videoOk || !audioOk) return "encode";
  return isMp4 && faststart ? "skip" : "remux";
}

/**
 * Argumentos de ffmpeg. Nunca cambia resolución ni fps.
 * encode: H.264 CRF 18 (visualmente sin pérdida), preset slow, yuv420p.
 *         HDR (HLG/PQ) → tonemap a SDR BT.709: única alteración de color, necesaria para que se vea bien en todos los navegadores.
 *         Audio AAC se copia tal cual; otro codec → AAC 192k.
 */
export function ffmpegArgs(action, input, output, info) {
  const common = ["-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "0"];
  if (action === "remux") {
    return [...common, "-c", "copy", "-movflags", "+faststart", output];
  }
  const vf = isHdr(info)
    ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
    : "format=yuv420p";
  return [
    ...common,
    "-vf", vf,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high",
    "-fps_mode", "passthrough",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    ...(info.aCodec === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"]),
    "-movflags", "+faststart",
    output,
  ];
}

export function runFfmpeg(args) {
  const ff = spawnSync("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  return { ok: ff.status === 0, stderr: ff.stderr?.toString() ?? "" };
}

/** Validate the actual output, including pixel format/audio/SDR and duration. */
export function verifyOutput(input, expectedDuration) {
  const info = probe(input);
  const durOk = Number.isFinite(info.duration) && info.duration > 0 &&
    (!expectedDuration || Math.abs(info.duration - expectedDuration) <= 1);
  const compatible = decide(info, { isMp4: true, faststart: true }) === "skip";
  const mp4 = info.container.split(",").includes("mp4");
  return { ok: compatible && mp4 && durOk, info };
}
