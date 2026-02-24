'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function SettingsRedirectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qb = searchParams?.get('quickbooks');
    const qs = qb ? `?quickbooks=${encodeURIComponent(qb)}` : '';
    router.replace(`/dashboard/settings${qs}`);
  }, [router, searchParams]);

  return null;
}

