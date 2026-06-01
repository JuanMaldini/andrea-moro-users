import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, createAdminClient, COLLECTION_DATA } from "@/lib/pocketbase";
import { type CourseRecord, buildCourseUrl } from "@/lib/course-utils";
import LogoutButton from "@/components/LogoutButton";

export default async function CursosPage() {
  const pb = await createServerClient();
  if (!pb.authStore.isValid) redirect("/admin");

  let courses: CourseRecord[] = [];
  try {
    const pbAdmin = createAdminClient();
    courses = await pbAdmin
      .collection(COLLECTION_DATA)
      .getFullList<CourseRecord>({ sort: "title" });
  } catch {
    // sin cursos o error de conexión
  }

  return (
    <main className="min-h-screen bg-vanilla">
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-marron">
            Cursos
          </span>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/cursos/nuevo"
              className="text-xs border border-marron text-marron px-4 py-1.5 hover:bg-marron hover:text-blanco transition-colors"
            >
              + Nuevo curso
            </Link>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {courses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-grisclarito text-sm mb-4">
              Aún no hay cursos.
            </p>
            <Link
              href="/admin/cursos/nuevo"
              className="text-xs text-marron hover:underline"
            >
              Crear el primer curso →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {courses.map((course) => {
              const keys = course.json?.keys ?? [];
              const videos = course.json?.videos ?? [];
              const slug = course.json?.slug ?? "";

              return (
                <Link
                  key={course.id}
                  href={`/admin/cursos/${course.id}`}
                  className="block bg-blanco px-6 py-4 shadow-sm hover:shadow transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-marron font-medium">
                        {course.title || "Sin título"}
                        {course.json?.published === false && (
                          <span className="ml-2 text-xs text-grisclarito font-normal">
                            (no publicado)
                          </span>
                        )}
                      </p>
                      {slug && (
                        <p className="text-xs text-grisclarito mt-0.5">
                          /{slug}_…
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-grisclarito">
                      <p>{keys.length} clave{keys.length !== 1 ? "s" : ""}</p>
                      <p>{videos.length} vídeo{videos.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
