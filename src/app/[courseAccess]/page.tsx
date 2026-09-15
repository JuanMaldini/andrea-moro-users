import { notFound } from "next/navigation";
import {
  createPublicClient,
  COLLECTION_COURSES,
  COLLECTION_VIDEOS,
  COLLECTION_MEDIA,
  getPbUrl,
} from "@/lib/pocketbase";
import {
  parseCourseAccess,
  type CourseRecord,
  type VideoRecord,
  type MediaRecord,
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
  const pb = createPublicClient();

  let course: CourseRecord;
  let videos: VideoRecord[] = [];
  let media: MediaRecord[] = [];
  try {
    course = await pb
      .collection(COLLECTION_COURSES)
      .getFirstListItem<CourseRecord>(pb.filter("slug = {:slug}", { slug }));
    [videos, media] = await Promise.all([
      pb.collection(COLLECTION_VIDEOS).getFullList<VideoRecord>({
        filter: pb.filter("course = {:id}", { id: course.id }),
        sort: "order",
      }),
      pb.collection(COLLECTION_MEDIA).getFullList<MediaRecord>({
        filter: pb.filter("course = {:id}", { id: course.id }),
        sort: "order",
      }),
    ]);
  } catch {
    return notFound();
  }

  return (
    <CoursePageClient
      token={token}
      title={course.title}
      description={course.description}
      videos={videos}
      resources={media.filter((m) => m.kind === "resource")}
      gallery={media.filter((m) => m.kind === "gallery")}
      pbUrl={getPbUrl()}
    />
  );
}
