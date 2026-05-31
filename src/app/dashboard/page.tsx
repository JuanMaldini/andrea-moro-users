import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, COLLECTION_DATA } from "@/lib/pocketbase";
import LogoutButton from "@/components/LogoutButton";

interface Course {
  id: string;
  title?: string;
  description?: string;
  files?: string[];
  field?: string[];
  created: string;
}

export default async function DashboardPage() {
  const pb = await createServerClient();

  if (!pb.authStore.isValid) {
    redirect("/");
  }

  const user = pb.authStore.model;
  const isAdmin = user?.admin === true;

  let courses: Course[] = [];

  try {
    if (isAdmin) {
      // Admin ve todos los cursos
      courses = await pb
        .collection(COLLECTION_DATA)
        .getFullList<Course>({ sort: "-created" });
    } else {
      // Usuario ve solo los cursos donde aparece en `field`
      courses = await pb
        .collection(COLLECTION_DATA)
        .getFullList<Course>({
          filter: `field ~ "${user?.id}"`,
          sort: "-created",
        });
    }
  } catch (err) {
    console.error("Error cargando cursos:", err);
  }

  return (
    <main className="min-h-screen bg-vanilla">
      {/* Nav */}
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-sm font-light tracking-[0.2em] text-marron uppercase">
            Andrea Moro · Cursos
          </h1>
          <div className="flex items-center gap-6">
            {isAdmin && (
              <Link
                href="/admin"
                className="text-xs uppercase tracking-widest text-marroncalido hover:text-marron transition-colors"
              >
                Admin
              </Link>
            )}
            <span className="text-xs text-grisclarito hidden sm:block">
              {user?.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </nav>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-xs uppercase tracking-widest text-marroncalido mb-8">
          {isAdmin ? "Todos los cursos" : "Mis cursos"}
        </h2>

        {courses.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-sm text-grisclarito">
              {isAdmin
                ? "Aún no hay cursos. Créalos desde el panel de admin."
                : "No tienes cursos asignados todavía."}
            </p>
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-block mt-4 text-sm text-marron hover:underline"
              >
                Ir a Admin →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {courses.map((course) => (
              <div
                key={course.id}
                className="bg-blanco p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="font-medium text-marron text-sm">
                  {course.title || "Sin título"}
                </h3>
                {course.description && (
                  <p className="text-xs text-grisclarito mt-1 line-clamp-2">
                    {course.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-grisclarito">
                    {course.files?.length ?? 0} video
                    {(course.files?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                  <Link
                    href={`/curso/${course.id}`}
                    className="text-xs text-marron hover:underline uppercase tracking-widest"
                  >
                    Ver →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
