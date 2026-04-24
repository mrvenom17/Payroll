import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Simple mock auth for the prototype phase
    if (email === 'admin@uabiotech.com' && password === 'admin123') {
      const response = NextResponse.json({ success: true, user: { name: 'Admin User', email } });
      
      // Set an HTTP-only cookie with a mock token
      response.cookies.set('auth_session', 'mock-jwt-token-12345', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 1 day
      });

      return response;
    }

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_session');
  return response;
}
