import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, COLLECTION_DATA } from "@/lib/pocketbase";
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

    // Verify course token matches URL token
    if (course.json?.token !== token) {
      return NextResponse.json({ valid: false });
    }

    // Check email is in keys list
    const keys: string[] = (course.json?.keys ?? []) as string[];
    const valid = keys.some((k) => k.toLowerCase() === email.trim().toLowerCase());

    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
