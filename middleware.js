import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Public paths
  if (path === '/login' || path.startsWith('/api/auth') || path.startsWith('/_next') || path.startsWith('/static')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_session')?.value;
  const session = verifySessionToken(token);

  if (!session) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', request.url);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete('auth_session'); // clear forged / stale token
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
};
