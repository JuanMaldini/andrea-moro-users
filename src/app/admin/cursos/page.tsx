import { redirect } from "next/navigation";
import Link from "next/link";
import {
  createServerClient,
  COLLECTION_COURSES,
  COLLECTION_VIDEOS,
  COLLECTION_MEDIA,
} from "@/lib/pocketbase";
import { pbFileUrl } from "@/lib/collections";
import {
  type CourseRecord,
  type VideoRecord,
  type MediaRecord,
  buildCourseUrl,
  resourceKind,
} from "@/lib/course-utils";
import LogoutButton from "@/components/LogoutButton";
import CourseCard from "./CourseCard";
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
  // Imágenes por curso para el carrusel de la tarjeta (galería + recursos de imagen)
  const courseImages = new Map<string, string[]>();
  try {
    const [allCourses, allVideos, allMedia] = await Promise.all([
      pb.collection(COLLECTION_COURSES).getFullList<CourseRecord>({ sort: "title" }),
      pb.collection(COLLECTION_VIDEOS).getFullList<Pick<VideoRecord, "course">>({ fields: "course" }),
      pb.collection(COLLECTION_MEDIA).getFullList<MediaRecord>({
        filter: 'kind = "gallery" || kind = "resource"',
        sort: "order,created",
      }),
    ]);
    courses = allCourses;
    for (const v of allVideos) videoCount.set(v.course, (videoCount.get(v.course) ?? 0) + 1);
    // La galería va primero; los recursos solo si son imágenes.
    const extraImages = new Map<string, string[]>();
    for (const m of allMedia) {
      if (!m.course) continue;
      if (m.kind === "resource" && resourceKind(m.file) !== "image") continue;
      const target = m.kind === "gallery" ? courseImages : extraImages;
      const url = pbFileUrl(COLLECTION_MEDIA, m.id, m.file);
      const list = target.get(m.course);
      if (list) list.push(url);
      else target.set(m.course, [url]);
    }
    for (const [courseId, urls] of extraImages) {
      const list = courseImages.get(courseId);
      if (list) list.push(...urls);
      else courseImages.set(courseId, urls);
    }
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4 max-w-[1600px] mx-auto">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                courseId={course.id}
                title={course.title}
                videosCount={videoCount.get(course.id) ?? 0}
                url={
                  course.slug && course.token
                    ? `${host}${buildCourseUrl(course.slug, course.token)}`.toLowerCase()
                    : null
                }
                images={courseImages.get(course.id) ?? []}
              />
            ))}
          </div>
        )}
      </div>

      <SiteGalleryManager />
    </main>
  );
}
