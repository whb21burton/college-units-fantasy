import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

const PUBLIC_PATHS = [
  '/',
  '/legal',
  '/legal/terms',
  '/legal/privacy',
  '/legal/contest-rules',
  '/legal/responsible-gaming',
  '/legal/state-restrictions',
];

const AUTH_REQUIRED_PATHS = [
  '/my-leagues',
  '/create-league',
  '/admin',
];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Skip middleware for static files and API routes (except compliance checks)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return res;
  }

  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  // Redirect unauthenticated users away from protected routes
  const requiresAuth = AUTH_REQUIRED_PATHS.some(p => pathname.startsWith(p));
  if (requiresAuth && !session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
