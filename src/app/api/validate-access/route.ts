import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, COLLECTION_DATA } from "@/lib/pocketbase";
import type { CourseKey } from "@/lib/course-utils";
import type { CourseRecord } from "@/lib/course-utils";

export async function POST(request: NextRequest) {
  try {
    const { courseId, token, email } = await request.json();

    if (!courseId || !token || !email) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const pb = createAdminClient();
    const course = await pb
      .collection(COLLECTION_DATA)
      .getOne<CourseRecord>(courseId);

    const keys = course.json?.keys ?? [];
    const match = (keys as CourseKey[]).find(
      (k: CourseKey) => k.token === token && k.email.toLowerCase() === email.toLowerCase()
    );

    return NextResponse.json({ valid: !!match });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
