import { Suspense } from 'react';
import { SettingsRedirectClient } from './SettingsRedirectClient';

// This route exists to support backend OAuth redirects to /settings
// and forward the user to the authenticated dashboard settings page.
export default function SettingsRedirectPage() {
  return (
    <Suspense fallback={null}>
      <SettingsRedirectClient />
    </Suspense>
  );
}

