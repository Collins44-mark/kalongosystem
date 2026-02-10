'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { useSearch } from '@/store/search';

type Worker = { id: string; name: string; sector: string; role: string; monthlySalary: string };

export default function WorkersPage() {
  const { token } = useAuth();
  const { t } = useTranslation();
  const searchQuery = useSearch((s) => s.query);
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

  const q = (searchQuery || '').trim().toLowerCase();
  const displayed = !q
    ? workers
    : workers.filter((w) => {
        const txt = `${w.name} ${w.sector} ${w.role}`.toLowerCase();
        return txt.includes(q);
      });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">{t('workers.title')}</h1>
      <div className="bg-white border rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left p-3">{t('workers.name')}</th>
                <th className="text-left p-3">{t('workers.sector')}</th>
                <th className="text-left p-3">{t('workers.role')}</th>
                <th className="text-right p-3">{t('workers.salary')}</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((w) => (
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
        {displayed.length === 0 && <p className="text-slate-500 p-4">{t('common.noItems')}</p>}
      </div>
    </div>
  );
}

function formatTzs(n: number) {
  return new Intl.NumberFormat('en-TZ', { maximumFractionDigits: 0 }).format(n);
}

