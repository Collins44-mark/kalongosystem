'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// This route exists to support backend OAuth redirects to /settings
// and forward the user to the authenticated dashboard settings page.
export default function SettingsRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qb = searchParams?.get('quickbooks');
    const qs = qb ? `?quickbooks=${encodeURIComponent(qb)}` : '';
    router.replace(`/dashboard/settings${qs}`);
  }, [router, searchParams]);

  return null;
}

