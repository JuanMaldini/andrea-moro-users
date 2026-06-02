import { notFound } from "next/navigation";
import { createAdminClient, COLLECTION_DATA, getPbUrl } from "@/lib/pocketbase";
import { parseCourseAccess, type CourseRecord, type CourseVideo } from "@/lib/course-utils";
import CoursePageClient from "./CoursePageClient";

interface Props {
  params: Promise<{ courseAccess: string }>;
}

export default async function CourseAccessPage({ params }: Props) {
  const { courseAccess } = await params;
  const parsed = parseCourseAccess(courseAccess);
  if (!parsed) return notFound();

  const { slug, token } = parsed;

  let course: CourseRecord | null = null;
  try {
    const pb = createAdminClient();
    const results = await pb
      .collection(COLLECTION_DATA)
      .getFullList<CourseRecord>({ filter: `json.slug = "${slug}"` });
    course = results[0] ?? null;
  } catch {
    return notFound();
  }

  if (!course) return notFound();

  // Verify course-level token
  if (course.json?.token !== token) return notFound();

  const videos: CourseVideo[] = (course.json?.videos ?? []).sort(
    (a, b) => a.order - b.order
  );

  return (
    <CoursePageClient
      courseId={course.id}
      token={token}
      title={course.title}
      description={course.description}
      videos={videos}
      pbUrl={getPbUrl()}
      collectionName={COLLECTION_DATA}
      published={course.json?.published ?? false}
      gallery={course.json?.gallery ?? []}
    />
  );
}
