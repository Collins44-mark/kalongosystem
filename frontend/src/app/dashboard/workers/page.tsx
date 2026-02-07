'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';

type Worker = { id: string; name: string; sector: string; role: string; monthlySalary: string };

export default function WorkersPage() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api<Worker[]>('/workers', { token })
      .then(setWorkers)
      .catch(() => setWorkers([]))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div>{t('common.loading')}</div>;

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('workers.title')}</h1>
      <div className="bg-white border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">{t('workers.name')}</th>
              <th className="text-left p-3">{t('workers.sector')}</th>
              <th className="text-left p-3">{t('workers.role')}</th>
              <th className="text-right p-3">{t('workers.salary')}</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="p-3">{w.name}</td>
                <td className="p-3">{w.sector}</td>
                <td className="p-3">{w.role}</td>
                <td className="p-3 text-right">{formatTzs(parseFloat(w.monthlySalary))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(n);
}
