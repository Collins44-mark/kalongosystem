'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/context';
import { notifyError, notifySuccess } from '@/store/notifications';

type Period = 'day' | 'week' | 'month' | 'bydate';

const ROLES = ['MANAGER', 'FRONT_OFFICE', 'BAR', 'RESTAURANT', 'KITCHEN', 'HOUSEKEEPING', 'FINANCE'];

type MessageRow = {
  id: string;
  senderId: string;
  senderRole: string;
  recipientRole: string;
  body: string;
  createdAt: string;
};

function toLocalDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function MessagesPage() {
  const { token, user } = useAuth();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('day');
  const [dateFrom, setDateFrom] = useState(() => toLocalDate(new Date()));
  const [dateTo, setDateTo] = useState(() => toLocalDate(new Date()));
  const [filterRecipient, setFilterRecipient] = useState<string>('');
  const [sendToRole, setSendToRole] = useState('FRONT_OFFICE');
  const [sendBody, setSendBody] = useState('');
  const [sending, setSending] = useState(false);

  const dateRange = useMemo(() => {
    const now = new Date();
    const today = toLocalDate(now);
    if (period === 'day') return { from: today, to: today };
    if (period === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: toLocalDate(start), to: today };
    }
    if (period === 'month') {
      return { from: toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    }
    return { from: dateFrom, to: dateTo };
  }, [period, dateFrom, dateTo]);

  function load() {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('period', period);
    if (period === 'bydate') {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    if (filterRecipient) params.set('recipientRole', filterRecipient);
    api<MessageRow[]>(`/messages?${params}`, { token })
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [token, period, dateFrom, dateTo, filterRecipient]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !sendBody.trim()) return;
    setSending(true);
    try {
      await api('/messages', {
        token,
        method: 'POST',
        body: JSON.stringify({ recipientRole: sendToRole, body: sendBody.trim() }),
      });
      notifySuccess(t('messages.sent'));
      setSendBody('');
      load();
    } catch (err) {
      notifyError((err as Error)?.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold">{t('messages.title')}</h1>

      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-medium text-slate-800">{t('messages.sendToRole')}</h2>
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('messages.recipientRole')}</label>
            <select
              value={sendToRole}
              onChange={(e) => setSendToRole(e.target.value)}
              className="w-full max-w-xs px-3 py-2 border rounded-lg text-sm bg-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">{t('messages.message')}</label>
            <textarea
              value={sendBody}
              onChange={(e) => setSendBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder={t('messages.placeholder')}
              required
            />
          </div>
          <button type="submit" disabled={sending} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {sending ? t('common.loading') : t('messages.send')}
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">{t('messages.filter')}:</span>
          {(['day', 'week', 'month', 'bydate'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${period === p ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {p === 'day' ? t('messages.today') : p === 'week' ? t('messages.thisWeek') : p === 'month' ? t('messages.thisMonth') : t('messages.byDate')}
            </button>
          ))}
          {period === 'bydate' && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
              <span className="text-slate-400">{t('common.to')}</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm" />
            </>
          )}
          <select
            value={filterRecipient}
            onChange={(e) => setFilterRecipient(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="">{t('messages.allRoles')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <h2 className="font-medium text-slate-800">{t('messages.inbox')}</h2>
        {loading ? (
          <div className="text-slate-500 text-sm">{t('common.loading')}</div>
        ) : messages.length === 0 ? (
          <p className="text-slate-500 text-sm">{t('messages.noMessages')}</p>
        ) : (
          <ul className="space-y-3 divide-y divide-slate-100">
            {messages.map((m) => (
              <li key={m.id} className="pt-3 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-slate-500">
                  <span>{new Date(m.createdAt).toLocaleString()}</span>
                  <span>{m.senderRole.replace(/_/g, ' ')} → {m.recipientRole.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
