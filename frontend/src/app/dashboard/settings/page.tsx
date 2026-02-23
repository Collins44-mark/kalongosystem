'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { isManagerLevel } from '@/lib/roles';
import { UserRolesSection } from './UserRolesSection';
import { SystemSettingsSection } from './SystemSettingsSection';
import { StaffWorkersSection } from './StaffWorkersSection';
import { TaxConfigurationSection } from './TaxConfigurationSection';
import { BusinessProfileSection } from './BusinessProfileSection';

type Subscription = { plan: string; status: string; trialEndsAt: string };
type MeResponse = { email: string; role: string; business: { id: string; name: string; code: string } };

export default function SettingsPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<Subscription>('/subscription', { token }).then(setSub).catch(() => setSub(null));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    api<MeResponse>('/api/me', { token })
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [token]);

  const isManager = isManagerLevel(user?.role);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold mb-4">{t('settings.title')}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <div className="bg-white border rounded p-4">
          <h2 className="font-medium mb-2">{t('settings.business')}</h2>
          {meLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-slate-200 rounded w-2/3" />
              <div className="h-4 bg-slate-200 rounded w-1/2" />
            </div>
          ) : me?.business ? (
            <div className="text-sm space-y-1">
              <div>{t('settings.name')}: {me.business.name}</div>
              <div>{t('settings.businessId')}: {me.business.code}</div>
            </div>
          ) : null}
        </div>
        {sub && (
          <div className="bg-white border rounded p-4">
            <h2 className="font-medium mb-2">{t('settings.subscription')}</h2>
            <div className="text-sm space-y-1">
              <div>{t('settings.plan')}: {sub.plan}</div>
              <div>{t('settings.status')}: {sub.status}</div>
              <div>{t('settings.trialEnds')}: {new Date(sub.trialEndsAt).toLocaleDateString()}</div>
            </div>
          </div>
        )}
      </div>

      {isManager && token && (
        <>
          <BusinessProfileSection token={token} t={t} />
          <UserRolesSection token={token} t={t} />
          <StaffWorkersSection token={token} t={t} />
          <SystemSettingsSection token={token} t={t} />
          <TaxConfigurationSection token={token} t={t} />
        </>
      )}
    </div>
  );
}
