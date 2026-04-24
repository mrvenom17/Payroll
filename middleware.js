import { NextResponse } from 'next/server';

export function middleware(request) {
  const path = request.nextUrl.pathname;
  
  // Public paths
  if (path === '/login' || path.startsWith('/api/auth') || path.startsWith('/_next') || path.startsWith('/static')) {
    return NextResponse.next();
  }

  // Check auth
  const token = request.cookies.get('auth_session')?.value;
  
  if (!token) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
};
