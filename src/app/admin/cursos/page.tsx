import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient, COLLECTION_COURSES, COLLECTION_VIDEOS } from "@/lib/pocketbase";
import { type CourseRecord, type VideoRecord, buildCourseUrl } from "@/lib/course-utils";
import LogoutButton from "@/components/LogoutButton";
import CopiarLink from "@/components/CopiarLink";
import SiteGalleryManager from "./SiteGalleryManager";

export default async function CursosPage() {
  const pb = await createServerClient();
  if (!pb.authStore.isValid) redirect("/admin");

  const host =
    (process.env["NEXT_PUBLIC_SITE_URL"] as string | undefined) ??
    "https://cursos.andreamorotienda.com";

  let courses: CourseRecord[] = [];
  // Cantidad de vídeos por curso
  const videoCount = new Map<string, number>();
  try {
    const [allCourses, allVideos] = await Promise.all([
      pb.collection(COLLECTION_COURSES).getFullList<CourseRecord>({ sort: "title" }),
      pb.collection(COLLECTION_VIDEOS).getFullList<Pick<VideoRecord, "course">>({ fields: "course" }),
    ]);
    courses = allCourses;
    for (const v of allVideos) videoCount.set(v.course, (videoCount.get(v.course) ?? 0) + 1);
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
              const videosCount = videoCount.get(course.id) ?? 0;
              const copyUrl = course.slug && course.token
                ? `${host}${buildCourseUrl(course.slug, course.token)}`.toLowerCase()
                : null;

              return (
                <Link
                  key={course.id}
                  href={`/admin/cursos/${course.id}`}
                  className="block bg-blanco border-2 border-marron rounded-lg overflow-hidden hover:shadow-xl transition-all hover:border-marroncalido group"
                >
                  {/* Sección de Título y Vídeos en un row */}
                  <div className="bg-marron px-3 md:px-4 py-3 md:py-3 flex items-center justify-between gap-3 border-b-2 border-grisoscuro group-hover:bg-marroncalido transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm md:text-base font-bold text-blanco break-words">
                        {course.title || "Sin título"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <p className="text-sm md:text-base font-bold text-blanco">
                        {videosCount}
                      </p>
                      <p className="text-xs md:text-sm text-blanco/90 font-medium">
                        {videosCount === 1 ? "vid." : "vid."}
                      </p>
                    </div>
                  </div>

                  {/* Fila de acciones: Editar · WhatsApp · Copiar · Abrir */}
                  {copyUrl && (
                    <div className="px-2 py-2 bg-vanilla flex items-stretch gap-1">
                      <CopiarLink url={copyUrl} courseId={course.id} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <SiteGalleryManager />
    </main>
  );
}
