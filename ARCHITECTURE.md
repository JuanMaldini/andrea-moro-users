# Andrea Moro · Cursos — Arquitectura

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS (misma paleta que `andrea-moro`) |
| Base de datos / Auth | PocketBase ≥ 0.23 (SDK `pocketbase@^0.26`) |
| Package manager | pnpm |
| Deploy | Vercel |

Sin token de superusuario en las apps: las páginas públicas leen como anónimo
(las API rules permiten leer lo publicado) y el panel admin usa la sesión del
usuario admin (cookie `pb_auth`, validada contra PocketBase con `authRefresh`).

---

## Colecciones PocketBase

`ADMIN` = `@request.auth.collectionName = "andreamoro_user"`
(usuario único; si hubiera más de uno, comparten los records).

### `andreamoro_user` (Auth)
Solo login del panel. Registro cerrado.
- list/view: `id = @request.auth.id` · create/update/delete: `null` (solo superuser)

### `andreamoro_courses` (Base) — un CURSO
| Campo | Tipo | Notas |
|---|---|---|
| title | text | |
| description | text | |
| price | number ≥ 0 | ARS |
| slug | text, único, `^[a-z0-9-]+$` | se fija al crear; editar el título no lo cambia |
| token | text `^[0-9a-f]{8}$` | parte del link (no se valida) |
| published | bool | |

Rules: list/view `published = true || ADMIN` · create/update/delete `ADMIN`

### `andreamoro_videos` (Base) — un VÍDEO
| course (relation → courses, cascade) | file (single, máx 10 GB) | name | order |

Rules: list/view `course.published = true || ADMIN` · write `ADMIN`

### `andreamoro_media` (Base) — archivos sueltos
| course (relation opcional, cascade) | kind: `resource` · `gallery` · `site_gallery` · `site_andrea` | file (single, máx 10 GB) | name | original | order |

Rules: list/view `course = "" || course.published = true || ADMIN` · write `ADMIN`

`andreamoro_data` es la colección anterior (json + campo `files`). Quedó como
backup tras `MIGRATE_V2` y ninguna app la usa.

---

## Variables de entorno

Vercel (users-app y tienda):
```bash
NEXT_PUBLIC_PB_URL=https://pocketbase.vmoliver.cloud
NEXT_PUBLIC_PB_USERS=andreamoro_user        # opcional (default)
NEXT_PUBLIC_PB_COURSES=andreamoro_courses   # opcional (default)
NEXT_PUBLIC_PB_VIDEOS=andreamoro_videos     # opcional (default)
NEXT_PUBLIC_PB_MEDIA=andreamoro_media       # opcional (default)
NEXT_PUBLIC_SITE_URL=https://cursos.andreamorotienda.com
```

Solo `.env` local (scripts): `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`, y para la
migración `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`.

---

## Rutas

| Ruta | Acceso | Descripción |
|---|---|---|
| `/{slug}_{token}` | Público + clave global | Presentación → clave → reproductor, lista de vídeos, recursos y galería |
| `/admin` | Público | Login |
| `/admin/cursos` | Admin | Lista de cursos + galerías del sitio |
| `/admin/cursos/nuevo` | Admin | Crear curso (slug único en minúsculas) |
| `/admin/cursos/[id]` | Admin | Editar curso, vídeos, recursos, galería |

---

## Subida de archivos

`src/lib/upload.ts` → `createWithProgress`: un record nuevo por archivo (POST),
progreso real por XHR, Wake Lock para que iOS no bloquee la pantalla, un
reintento si se corta la conexión, y mensajes claros (tamaño, sesión, red).

Si igual falla con vídeos muy pesados, revisar en el servidor que el proxy
(Caddy) no limite `request_body max_size` ni corte por timeout.

---

## Scripts (`.bat`, requieren ffmpeg)

| Script | Qué hace |
|---|---|
| `MIGRATE_V2.bat [--apply]` | Migra `andreamoro_data` → colecciones v2 (mismos ids/slugs/tokens). Simula por defecto. |
| `CONVERT_VIDEOS.bat [--apply]` | Deja todos los vídeos reproducibles en cualquier navegador sin cambiar resolución/fps: skip / remux faststart / H.264 CRF 18 (HDR → SDR). Simula por defecto. |
| `UPLOAD_BATCH.bat <carpeta> <slug> [--append\|--replace]` | Sube una carpeta de vídeos a un curso con la misma conversión. |

Los scripts viejos (`seed-prices`, `ensure-published`, `fix-flores-nepal`,
`clean-old-keys`, `upload-gallery`, `convert-videos`) trabajan sobre
`andreamoro_data` y quedaron solo como histórico.

---

## Setup local

```bash
pnpm install
pnpm dev   # → http://localhost:3000
```
