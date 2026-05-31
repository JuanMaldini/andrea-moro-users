import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, COLLECTION_USERS, COLLECTION_DATA } from "@/lib/pocketbase";
import LogoutButton from "@/components/LogoutButton";

interface PbUser {
  id: string;
  email: string;
  admin?: boolean;
  verified?: boolean;
  created: string;
}

interface Course {
  id: string;
  title?: string;
  files?: string[];
  field?: string[];
  created: string;
}

export default async function AdminPage() {
  const pb = await createServerClient();

  if (!pb.authStore.isValid || !pb.authStore.model?.admin) {
    redirect("/dashboard");
  }

  let users: PbUser[] = [];
  let courses: Course[] = [];

  try {
    users = await pb
      .collection(COLLECTION_USERS)
      .getFullList<PbUser>({ sort: "email" });

    courses = await pb
      .collection(COLLECTION_DATA)
      .getFullList<Course>({ sort: "-created" });
  } catch (err) {
    console.error("Admin fetch error:", err);
  }

  return (
    <main className="min-h-screen bg-vanilla">
      {/* Nav */}
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-xs text-grisclarito hover:text-marron transition-colors"
            >
              ← Dashboard
            </Link>
            <span className="text-grisclarito">·</span>
            <span className="text-xs uppercase tracking-widest text-marron">
              Admin
            </span>
          </div>
          <LogoutButton />
        </div>
      </nav>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-12">

        {/* === Usuarios === */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest text-marroncalido">
              Usuarios ({users.length})
            </h2>
          </div>

          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="bg-blanco px-4 py-3 shadow-sm flex items-center justify-between"
              >
                <div>
                  <p className="text-sm text-marron">{u.email}</p>
                  <p className="text-xs text-grisclarito mt-0.5">
                    {u.admin ? "Admin" : "Usuario"}
                    {u.verified ? "" : " · No verificado"}
                  </p>
                </div>
              </div>
            ))}

            {users.length === 0 && (
              <p className="text-xs text-grisclarito text-center py-6">
                No hay usuarios todavía.
              </p>
            )}
          </div>
        </section>

        {/* === Cursos === */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest text-marroncalido">
              Cursos ({courses.length})
            </h2>
            {/* TODO: enlazar a /admin/nuevo-curso en la próxima iteración */}
            <span
              title="Próximamente: crear curso desde aquí"
              className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 cursor-not-allowed"
            >
              + Nuevo
            </span>
          </div>

          <div className="space-y-2">
            {courses.map((c) => (
              <div key={c.id} className="bg-blanco px-4 py-3 shadow-sm">
                <p className="text-sm text-marron">{c.title || "Sin título"}</p>
                <p className="text-xs text-grisclarito mt-0.5">
                  {c.files?.length ?? 0} video
                  {(c.files?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                  {c.field?.length ?? 0} usuario
                  {(c.field?.length ?? 0) !== 1 ? "s" : ""} asignado
                  {(c.field?.length ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
            ))}

            {courses.length === 0 && (
              <p className="text-xs text-grisclarito text-center py-6">
                Aún no hay cursos.{" "}
                <span className="block mt-1">
                  Créalos directamente en PocketBase de momento.
                </span>
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Nota de desarrollo */}
      <div className="max-w-5xl mx-auto px-6 pb-12">
        <div className="border border-grisoscuro bg-grisclaro px-6 py-4 text-xs text-grisclarito space-y-1">
          <p className="font-medium text-marroncalido uppercase tracking-widest">
            Notas para esta fase
          </p>
          <p>
            • Los usuarios se crean manualmente en PocketBase (Admin UI en{" "}
            <span className="text-marron">
              {process.env.NEXT_PUBLIC_PB_URL || "tu PocketBase URL"}
            </span>
            /_/).
          </p>
          <p>
            • La colección <code>andreamoro_data</code> necesita los campos{" "}
            <strong>title</strong> (Text) y <strong>description</strong> (Text)
            para mostrar los cursos correctamente.
          </p>
          <p>
            • La asignación usuario ↔ curso se hace editando el campo{" "}
            <code>field</code> del curso en PocketBase.
          </p>
        </div>
      </div>
    </main>
  );
}
