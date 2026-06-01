import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  createServerClient,
  createAdminClient,
  COLLECTION_DATA,
} from "@/lib/pocketbase";
import { type CourseRecord } from "@/lib/course-utils";
import LogoutButton from "@/components/LogoutButton";
import CursoEditor from "./CursoEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CursoDetailPage({ params }: Props) {
  const { id } = await params;

  const pb = await createServerClient();
  if (!pb.authStore.isValid || !pb.authStore.record?.admin) redirect("/admin");

  let course: CourseRecord | undefined;
  try {
    const pbAdmin = createAdminClient();
    course = await pbAdmin
      .collection(COLLECTION_DATA)
      .getOne<CourseRecord>(id);
  } catch {
    return notFound();
  }

  if (!course) return notFound();

  const host =
    (process.env["NEXT_PUBLIC_SITE_URL"] as string | undefined) ??
    "https://cursos.andreamorotienda.com";

  return (
    <main className="min-h-screen bg-vanilla">
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/cursos"
              className="text-xs text-grisclarito hover:text-marron transition-colors"
            >
              ← Cursos
            </Link>
            <span className="text-grisclarito text-xs">·</span>
            <span className="text-xs text-marroncalido truncate max-w-[200px]">
              {course.title}
            </span>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <CursoEditor course={course} host={host} collectionName={COLLECTION_DATA} />
      </div>
    </main>
  );
}
