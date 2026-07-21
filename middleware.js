import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

export async function middleware(request, event) {
  const path = request.nextUrl.pathname;

  // Public paths
  if (path === '/login' || path.startsWith('/api/auth') || path.startsWith('/_next') || path.startsWith('/static')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_session')?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', request.url);
    const res = NextResponse.redirect(url);
    if (token) res.cookies.delete('auth_session'); // clear forged / stale token
    return res;
  }

  if (session && path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    // Avoid logging the audit endpoint itself to prevent loops/spam
    if (path !== '/api/audit') {
      const logAudit = async () => {
        try {
          await fetch(new URL('/api/audit', request.url).toString(), {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Cookie': request.headers.get('cookie') || ''
            },
            body: JSON.stringify({
              action: `API_${request.method}`,
              entity_type: path.replace('/api/', '').split('/')[0],
              details: { path, method: request.method },
              performed_by: session.id,
              is_auto_log: true
            })
          });
        } catch (e) {
          console.error('Audit log failed', e);
        }
      };
      if (event && event.waitUntil) {
        event.waitUntil(logAudit());
      } else {
        logAudit().catch(() => {});
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)'],
};
