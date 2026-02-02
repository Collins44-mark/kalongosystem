import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Route protection for /dashboard is handled client-side in dashboard layout
 * (useAuth + redirect when no user), since JWT is in localStorage.
 * Middleware can be extended to set/read cookies if needed.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
