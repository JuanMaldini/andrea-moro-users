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
  if (!pb.authStore.isValid) redirect("/admin");

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

  return (
    <main className="min-h-screen bg-vanilla">
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/cursos"
              className="text-xs font-semibold text-marron hover:text-marroncalido transition-colors"
            >
              ← Cursos
            </Link>
            <span className="text-marron text-sm">·</span>
            <span className="text-sm font-bold text-marron truncate max-w-[300px]">
              {course.title}
            </span>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        <CursoEditor course={course} />
      </div>
    </main>
  );
}
