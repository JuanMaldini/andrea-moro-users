import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, createAdminClient, COLLECTION_DATA } from "@/lib/pocketbase";
import { type CourseRecord, buildCourseUrl } from "@/lib/course-utils";
import LogoutButton from "@/components/LogoutButton";
import CopiarLink from "@/components/CopiarLink";

export default async function CursosPage() {
  const pb = await createServerClient();
  if (!pb.authStore.isValid) redirect("/admin");

  const host =
    (process.env["NEXT_PUBLIC_SITE_URL"] as string | undefined) ??
    "https://cursos.andreamorotienda.com";

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
              className="text-xs font-bold border-2 border-marron text-marron px-4 py-2 hover:bg-marron hover:text-blanco transition-all rounded"
            >
              + Nuevo curso
            </Link>
            <LogoutButton />
          </div>
        </div>
      </nav>

      <div className="w-full px-4 py-6 md:px-6 md:py-10">
        {courses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-marron text-xl font-bold mb-6">Aún no hay cursos.</p>
            <Link href="/admin/cursos/nuevo" className="text-lg text-marron hover:text-marroncalido font-bold transition-colors">
              Crear el primer curso →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {courses.map((course) => {
              const keys = course.json?.keys ?? [];
              const videos = course.json?.videos ?? [];
              const slug = course.json?.slug ?? "";
              const courseToken = course.json?.token;
              const copyUrl = slug && courseToken
                ? `${host}${buildCourseUrl(slug, courseToken)}`
                : null;

              return (
                <Link
                  key={course.id}
                  href={`/admin/cursos/${course.id}`}
                  className="block bg-blanco border-2 border-marron rounded-lg overflow-hidden hover:shadow-xl transition-all hover:border-marroncalido group"
                >
                  {/* Sección de Título, Claves y Vídeos en un row */}
                  <div className="bg-marron px-3 md:px-4 py-3 md:py-3 flex items-center justify-between gap-3 border-b-2 border-grisoscuro group-hover:bg-marroncalido transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm md:text-base font-bold text-blanco break-words">
                        {course.title || "Sin título"}
                        {course.json?.published === false && (
                          <span className="ml-1 text-xs text-blanco/80 font-normal">
                            (no publicado)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 md:gap-5 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm md:text-base font-bold text-blanco">
                          {keys.length}
                        </p>
                        <p className="text-xs md:text-sm text-blanco/90 font-medium">
                          {keys.length === 1 ? "clave" : "cl."}
                        </p>
                      </div>
                      <div className="w-px h-4 bg-blanco/30"></div>
                      <div className="flex items-center gap-1">
                        <p className="text-sm md:text-base font-bold text-blanco">
                          {videos.length}
                        </p>
                        <p className="text-xs md:text-sm text-blanco/90 font-medium">
                          {videos.length === 1 ? "vid." : "vid."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Sección de Slug */}
                  {slug && (
                    <div className="bg-grisclaro px-3 md:px-4 py-2 border-b-2 border-grisoscuro group-hover:bg-gris200 transition-colors">
                      <p className="text-xs text-marron font-mono font-semibold break-all">
                        {copyUrl ? copyUrl.replace(host, "") : `/${slug}`}
                      </p>
                    </div>
                  )}

                  {/* Sección de Botones */}
                  {copyUrl && (
                    <div className="px-3 md:px-4 py-3 md:py-3 bg-vanilla">
                      <CopiarLink url={copyUrl} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
