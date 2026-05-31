import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-vanilla flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo / cabecera */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-light tracking-[0.25em] text-marron uppercase">
            Andrea Moro
          </h1>
          <p className="text-grisclarito text-xs tracking-widest mt-1 uppercase">
            Cursos
          </p>
        </div>

        {/* Card login */}
        <div className="bg-blanco px-8 py-10 shadow-sm">
          <LoginForm />
        </div>

        {/* Pie */}
        <p className="text-center text-xs text-grisclarito mt-6">
          ¿Problemas para acceder?{" "}
          <a
            href="mailto:info@andreamorotienda.com"
            className="text-marron hover:underline"
          >
            Contacta con Andrea
          </a>
        </p>
      </div>
    </main>
  );
}
