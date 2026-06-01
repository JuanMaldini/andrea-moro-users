import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/pocketbase";
import NuevoCursoForm from "./NuevoCursoForm";
import LogoutButton from "@/components/LogoutButton";

export default async function NuevoCursoPage() {
  const pb = await createServerClient();
  if (!pb.authStore.isValid) redirect("/admin");

  return (
    <main className="min-h-screen bg-vanilla">
      <nav className="bg-blanco border-b border-grisoscuro px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/cursos"
              className="text-xs text-grisclarito hover:text-marron transition-colors"
            >
              ← Cursos
            </Link>
            <span className="text-grisclarito text-xs">·</span>
            <span className="text-xs uppercase tracking-widest text-marron">
              Nuevo curso
            </span>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <NuevoCursoForm />
      </div>
    </main>
  );
}
