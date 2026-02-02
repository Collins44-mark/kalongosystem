'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import { RoleGuard } from '@/components/RoleGuard';

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || 'http://localhost:8000';

export default function BarPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <RoleGuard
      permission="create_pos_order"
      fallback={
        <Layout>
          <p className="text-gray-600">You do not have access to Bar.</p>
        </Layout>
      }
    >
      <Layout>
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary-100 rounded-xl">
                <span className="text-3xl" aria-hidden>🍷</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Bar</h1>
                <p className="text-gray-600">Drinks, stock, POS</p>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Manage bar items, stock levels, and sales.
            </p>
            <a
              href={`${API_URL}/admin/restaurant/`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2"
            >
              Open Bar Admin
            </a>
          </div>
        </div>
      </Layout>
    </RoleGuard>
  );
}
