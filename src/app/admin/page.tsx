import { redirect } from "next/navigation";
import Link from "next/link";
import {
  createServerClient,
  createAdminClient,
  COLLECTION_USERS,
  COLLECTION_DATA,
} from "@/lib/pocketbase";
import { log } from "@/lib/logger";
import LogoutButton from "@/components/LogoutButton";

interface PbUser {
  id: string;
  email: string;
  admin?: boolean;
  verified?: boolean;
  created: string;
}

interface CourseJson {
  published?: boolean;
  users?: string[];
  videos?: { file: string; name: string; order: number }[];
}

interface CourseRecord {
  id: string;
  files: string[];
  title: string;
  description: string;
  json: CourseJson;
  created: string;
}

export default async function AdminPage() {
  const pb = await createServerClient();

  if (!pb.authStore.isValid) redirect("/");

  let isAdmin = false;
  try {
    const { record } = await pb.collection(COLLECTION_USERS).authRefresh();
    isAdmin = record.admin === true;
  } catch (err) {
    log.error("authRefresh en /admin", err);
    redirect("/");
  }

  if (!isAdmin) redirect("/dashboard");

  // El admin client bypasea emailVisibility y API Rules vacías.
  // Sin PB_ADMIN_TOKEN configurado, ambas fetches fallarán con "Only superusers".
  const hasAdminToken = !!process.env.PB_ADMIN_TOKEN;
  const pbAdmin = hasAdminToken ? createAdminClient() : pb;

  let users: PbUser[] = [];
  let courses: CourseRecord[] = [];

  try {
    users = await pbAdmin
      .collection(COLLECTION_USERS)
      .getFullList<PbUser>({ sort: "email" });

    users.sort((a, b) => {
      if (a.admin && !b.admin) return -1;
      if (!a.admin && b.admin) return 1;
      return (a.email ?? "").localeCompare(b.email ?? "");
    });
  } catch (err) {
    log.error("cargando usuarios", err);
  }

  try {
    courses = await pbAdmin
      .collection(COLLECTION_DATA)
      .getFullList<CourseRecord>({ sort: "title" });
  } catch (err) {
    log.error("cargando cursos", err);
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
            <span className="text-xs uppercase tracking-widest text-marron">Admin</span>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-2 gap-12">

        {/* === Usuarios === */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-marroncalido mb-6">
            Usuarios ({users.length})
          </h2>

          {!hasAdminToken && (
            <p className="text-xs text-grisclarito mb-4 border border-grisoscuro px-3 py-2">
              PB_ADMIN_TOKEN no configurado — algunos emails pueden no ser visibles.
            </p>
          )}

          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="bg-blanco px-4 py-3 shadow-sm flex items-center justify-between"
              >
                <p className="text-sm text-marron">{u.email}</p>
                {u.admin && (
                  <span className="text-xs text-marroncalido uppercase tracking-widest">
                    Admin
                  </span>
                )}
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-xs text-grisclarito text-center py-6">No hay usuarios.</p>
            )}
          </div>
        </section>

        {/* === Cursos === */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-widest text-marroncalido">
              Cursos ({courses.length})
            </h2>
            <span
              title="Próximamente"
              className="text-xs text-grisclarito border border-grisoscuro px-3 py-1 cursor-not-allowed"
            >
              + Nuevo
            </span>
          </div>

          <div className="space-y-2">
            {courses.map((c) => {
              const videoCount = c.json?.videos?.length ?? c.files?.length ?? 0;
              const userCount  = c.json?.users?.length ?? 0;
              return (
                <div key={c.id} className="bg-blanco px-4 py-3 shadow-sm">
                  <p className="text-sm text-marron">
                    {c.title || "Sin título"}
                    {c.json?.published === false && (
                      <span className="ml-2 text-xs text-grisclarito">(no publicado)</span>
                    )}
                  </p>
                  <p className="text-xs text-grisclarito mt-0.5">
                    {videoCount} video{videoCount !== 1 ? "s" : ""} ·{" "}
                    {userCount} usuario{userCount !== 1 ? "s" : ""} asignado
                    {userCount !== 1 ? "s" : ""}
                  </p>
                </div>
              );
            })}
            {courses.length === 0 && (
              <p className="text-xs text-grisclarito text-center py-6">
                Aún no hay cursos. Créalos en PocketBase.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
