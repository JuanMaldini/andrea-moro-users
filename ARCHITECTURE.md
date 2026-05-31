# Andrea Moro · Cursos — Arquitectura

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS (misma paleta que `andrea-moro`) |
| Base de datos / Auth | PocketBase |
| SDK cliente | `pocketbase` npm |
| Email (futuro) | Resend (SMTP en PocketBase settings) |
| Deploy | Vercel |

---

## Colecciones PocketBase

### `andreamoro_user` (Type: Auth)
| Campo | Tipo | Notas |
|---|---|---|
| id | Text | Auto |
| email | Email | Único |
| password | Password | Hidden |
| tokenKey | Text | Hidden, único |
| emailVisibility | Bool | |
| verified | Bool | |
| admin | Bool | `true` → acceso admin |
| json | JSON | Datos extra opcionales |
| created / updated | Date | Auto |

### `andreamoro_data` (Type: Base) — representa un CURSO
| Campo | Tipo | Notas |
|---|---|---|
| id | Text | Auto |
| **title** | Text | ⚠️ AÑADIR en PocketBase |
| **description** | Text | ⚠️ AÑADIR en PocketBase |
| files | File (Multiple) | Los archivos de video del curso |
| field | Relation → andreamoro_user (Multiple) | Usuarios con acceso |
| created / updated | Date | Auto |

> **Acción requerida**: añadir `title` y `description` a `andreamoro_data` en PocketBase Admin UI.

---

## Variables de entorno

Archivo: `.env` (local, nunca commitear — está en `.gitignore`)

```bash
# URL pública de PocketBase
NEXT_PUBLIC_PB_URL=https://pocketbase.vmoliver.cloud

# Nombres de colecciones
NEXT_PUBLIC_PB_USERS=andreamoro_user
NEXT_PUBLIC_PB_DATA=andreamoro_data

# Token admin — solo server-side
PB_ADMIN_TOKEN=...
```

---

## Rutas

| Ruta | Acceso | Descripción |
|---|---|---|
| `/` | Público | Login |
| `/dashboard` | Autenticado | Lista de cursos asignados |
| `/admin` | Admin only | Panel de gestión |
| `/curso/[id]` | Autenticado | Reproductor de video (próximo) |

---

## Flujo de autenticación

```
1. Usuario introduce email + contraseña en /
2. LoginForm llama pb.collection('andreamoro_user').authWithPassword(...)
3. PocketBase devuelve token JWT + record del usuario
4. El authStore.onChange hook exporta la sesión como cookie `pb_auth`
5. El middleware de Next.js lee esa cookie en cada request
6. Server Components cargan pb.authStore desde la misma cookie
7. Al hacer logout, pb.authStore.clear() → cookie vacía → middleware redirige a /
```

---

## Modelo de acceso a cursos

- **Admin**: ve todos los cursos en `andreamoro_data`
- **Usuario**: ve solo los cursos donde su `id` aparece en el campo `field`
- La asignación se hace desde PocketBase Admin UI editando el campo `field` del curso

---

## Roadmap de features futuras

### Fase 2 — CRUD de cursos desde la app
- Página `/admin/nuevo-curso`: formulario para crear un curso, subir videos
- Página `/admin/curso/[id]`: editar título, descripción, asignar/desasignar usuarios, reordenar videos

### Fase 3 — Reproductor de video
- Ruta `/curso/[id]` con listado de videos del curso
- Reproductor basado en **Plyr.js** (open source, MIT) — `npm install plyr`
- Sirve los archivos de PocketBase con auth (URLs firmadas o con token)
- Progreso del usuario (campo en `andreamoro_user.json` o nueva colección `progress`)

### Fase 4 — Registro autónomo y recuperación de contraseña
- Configurar **Resend** como SMTP en PocketBase Settings → Mail
  - Host: `smtp.resend.com`, Puerto: `465`, Usuario: `resend`, Pass: API key
- Añadir enlace "Olvidé mi contraseña" → llama a
  `pb.collection('andreamoro_user').requestPasswordReset(email)`
- PocketBase envía email de reset automáticamente
- Página `/reset-password?token=...` para completar el reset
- Página `/register` (opcional) para auto-registro con verificación de email

### Fase 5 — Diseño final
- Homogeneizar con la estética de `andreamorotienda.com`
- Tipografía, espaciados, favicon, OG image

---

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar env
cp .env.example .env
# Editar .env con tus valores

# 3. Arrancar
npm run dev
# → http://localhost:3000
```

## Deploy en Vercel

```bash
# Conectar repo en vercel.com
# Añadir variables de entorno en Vercel Dashboard > Settings > Environment Variables
# La misma lista que en .env.example
```

---

## Notas de seguridad

- Las cookies de sesión (`pb_auth`) son `HttpOnly: false` en desarrollo porque Next.js
  client components necesitan escribirlas via `document.cookie`. En producción, considerar
  usar una API Route para setear cookies HttpOnly verdaderas.
- El `PB_ADMIN_TOKEN` **nunca** debe estar en variables `NEXT_PUBLIC_*`.
- Habilitar **API Rules** en PocketBase para cada colección:
  - `andreamoro_user`: solo admins pueden listar todos los usuarios
  - `andreamoro_data`: solo ver si `@request.auth.id != "" && (field ~ @request.auth.id || @request.auth.admin = true)`
