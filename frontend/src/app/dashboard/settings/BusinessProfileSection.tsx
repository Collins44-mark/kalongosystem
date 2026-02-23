'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { notifyError, notifySuccess } from '@/store/notifications';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type BusinessProfile = {
  id: string;
  name: string;
  businessId: string;
  businessType: string;
  location?: string;
  phone?: string;
  logoUrl?: string | null;
  logo_url?: string | null;
};

function errorMessageFromJson(data: any, fallback: string) {
  const msg = data?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string' && msg.trim()) return msg;
  return fallback;
}

export function BusinessProfileSection({ token, t }: { token: string; t: (k: string) => string }) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const logoPath = (profile?.logo_url ?? profile?.logoUrl ?? null) ? String(profile?.logo_url ?? profile?.logoUrl) : null;
  const logoSrc = useMemo(() => {
    if (!logoPath) return null;
    if (/^https?:\/\//i.test(logoPath)) return logoPath;
    return `${API_URL}${logoPath}`;
  }, [logoPath]);

  async function loadProfile() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/business/profile`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Failed to load business profile'));
      setProfile(data as BusinessProfile);
      setCacheBust(Date.now());
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function uploadFile(f: File) {
    const type = String(f?.type || '').toLowerCase();
    if (!['image/png', 'image/jpeg'].includes(type)) {
      notifyError(t('settings.logoOnlyImages'));
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      notifyError(t('settings.logoTooLarge'));
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${API_URL}/business/upload-logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(errorMessageFromJson(data, 'Logo upload failed'));
      notifySuccess(t('settings.logoUploadSuccess'));
      await loadProfile();
    } catch (e) {
      notifyError((e as Error).message);
    } finally {
      setUploading(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) uploadFile(f);
  }

  return (
    <div className="bg-white border rounded p-4 max-w-md">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('settings.businessProfile')}</h2>
        <button
          onClick={() => loadProfile()}
          disabled={loading || uploading}
          className="text-xs px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-60"
          type="button"
        >
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="mt-3 animate-pulse space-y-2">
          <div className="h-36 bg-slate-100 rounded" />
          <div className="h-9 bg-slate-100 rounded" />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div
            className={[
              'border rounded h-36 bg-slate-50 flex items-center justify-center overflow-hidden',
              dragging ? 'ring-2 ring-teal-500 border-teal-500' : '',
            ].join(' ')}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            aria-label={t('settings.dragDropLogo')}
          >
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${logoSrc}${logoSrc.includes('?') ? '&' : '?'}v=${cacheBust}`}
                alt={t('settings.logoAlt')}
                className="w-full h-full object-contain p-2"
                onError={() => {
                  // broken url or removed file
                  setProfile((p) => (p ? { ...p, logoUrl: null, logo_url: null } : p));
                }}
              />
            ) : (
              <div className="text-sm text-slate-500">{t('settings.noLogoUploaded')}</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 rounded bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                  <span>{t('settings.uploading')}</span>
                </>
              ) : (
                <span>{t('settings.uploadLogo')}</span>
              )}
            </button>
            <span className="text-xs text-slate-500">{t('settings.dragDropLogo')}</span>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
            }}
          />

          <p className="text-xs text-slate-500">{t('settings.logoHint')}</p>
        </div>
      )}
    </div>
  );
}

