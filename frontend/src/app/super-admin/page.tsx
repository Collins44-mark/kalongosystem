'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSuperAdminAuth } from '@/store/superAdminAuth';

/** Single login is at /login. Redirect so super-admin uses the same form. */
export default function SuperAdminLoginPage() {
  const router = useRouter();
  const token = useSuperAdminAuth((s) => s.token);

  useEffect(() => {
    if (token) {
      router.replace('/super-admin/dashboard');
    } else {
      router.replace('/login');
    }
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <p className="text-slate-600">Redirecting to login...</p>
    </div>
  );
}
