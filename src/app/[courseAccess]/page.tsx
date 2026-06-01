import { notFound } from "next/navigation";
import { createAdminClient, COLLECTION_DATA, getPbUrl } from "@/lib/pocketbase";
import {
  parseCourseAccess,
  type CourseRecord,
  type CourseVideo,
} from "@/lib/course-utils";
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
      .getFullList<CourseRecord>({
        filter: `json.slug = "${slug}"`,
      });
    course = results[0] ?? null;
  } catch {
    return notFound();
  }

  if (!course) return notFound();

  const keys = course.json?.keys ?? [];
  const keyExists = keys.some((k) => k.token === token);
  if (!keyExists) return notFound();

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
      fileIds={course.files}
      pbUrl={getPbUrl()}
      collectionName={COLLECTION_DATA}
    />
  );
}
