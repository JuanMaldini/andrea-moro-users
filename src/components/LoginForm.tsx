"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPocketBase, COLLECTION_USERS } from "@/lib/pocketbase-browser";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const pb = getPocketBase();
      await pb.collection(COLLECTION_USERS).authWithPassword(email, password);
      // La cookie se setea automáticamente via el onChange del authStore
      router.push("/admin/cursos");
      router.refresh();
    } catch {
      setError("Email o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-bold uppercase tracking-widest text-marron mb-3"
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all rounded"
          placeholder="tu@email.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-bold uppercase tracking-widest text-marron mb-3"
        >
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-4 py-3 border-2 border-marron bg-vanilla text-base text-negro focus:outline-none focus:ring-2 focus:ring-marron transition-all rounded"
          placeholder="••••••••"
        />
      </div>

      {error && <p className="text-rojo text-base font-semibold bg-rojo/10 px-4 py-3 rounded border border-rojo">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-marron text-blanco text-base font-bold uppercase tracking-widest hover:bg-marroncalido transition-all hover:shadow-lg disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed rounded"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
