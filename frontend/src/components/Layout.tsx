'use client';

import React from 'react';
import Link from 'next/link';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-800 text-white px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" className="text-slate-300 hover:text-white text-sm">
          ← Dashboard
        </Link>
        <span className="text-slate-500">|</span>
        <span className="font-semibold">Kalongo Hotel</span>
      </header>
      <main className="p-8">{children}</main>
    </div>
  );
}
