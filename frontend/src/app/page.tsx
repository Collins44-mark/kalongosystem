import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Kalongo Hotel</h1>
        <p className="text-slate-600 mb-8">Hotel Management & Financial Control System</p>
        <Link
          href="/login"
          className="inline-block btn-primary"
        >
          Sign in
        </Link>
        <p className="mt-6 text-sm text-slate-500">
          Front Office · Back Office · POS · Reports
        </p>
      </div>
    </main>
  );
}
