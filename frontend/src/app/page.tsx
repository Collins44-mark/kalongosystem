'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/store/auth';

export default function HomePage() {
  const router = useRouter();
  const { token, user } = useAuth();

  useEffect(() => {
    if (token && user) {
      router.replace('/dashboard');
    }
  }, [token, user, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100">
      <div className="text-center max-w-md px-4">
        <h1 className="text-3xl font-bold text-teal-800 mb-2">
          HMS
        </h1>
        <p className="text-slate-600 mb-8">
          Hotel Management System — Tanzania
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="px-6 py-2 border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
