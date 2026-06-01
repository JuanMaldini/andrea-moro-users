import LoginForm from "@/components/LoginForm";

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-vanilla flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-light tracking-[0.25em] text-marron uppercase">
            Andrea Moro
          </h1>
          <p className="text-grisclarito text-xs tracking-widest mt-1 uppercase">
            Panel de administración
          </p>
        </div>
        <div className="bg-blanco px-8 py-10 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
