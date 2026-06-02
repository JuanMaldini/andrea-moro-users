import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, COLLECTION_DATA } from "@/lib/pocketbase";
import type { CourseRecord } from "@/lib/course-utils";

// Rate limiter en memoria: máx 10 intentos por IP por minuto.
// En Vercel cada instancia tiene su propio Map; suficiente para bloquear
// ataques simples sin dependencias externas.
const rl = new Map<string, { n: number; until: number }>();
const RL_MAX = 5_000; // máximo de entradas antes de purgar las expiradas

function limited(ip: string): boolean {
  const now = Date.now();

  // Purga entradas expiradas cuando el Map crece demasiado
  if (rl.size >= RL_MAX) {
    for (const [key, val] of rl) {
      if (now > val.until) rl.delete(key);
    }
  }

  const e = rl.get(ip);
  if (!e || now > e.until) { rl.set(ip, { n: 1, until: now + 60_000 }); return false; }
  if (e.n >= 10) return true;
  e.n++;
  return false;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (limited(ip)) {
    return NextResponse.json({ valid: false }, { status: 429 });
  }
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
