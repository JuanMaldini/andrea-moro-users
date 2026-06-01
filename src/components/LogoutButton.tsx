"use client";

import { useRouter } from "next/navigation";
import { getPocketBase } from "@/lib/pocketbase-browser";

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    const pb = getPocketBase();
    pb.authStore.clear(); // dispara onChange → borra la cookie
    router.push("/admin");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-xs text-grisclarito uppercase tracking-widest hover:text-rojo transition-colors cursor-pointer"
    >
      Salir
    </button>
  );
}
