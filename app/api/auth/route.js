import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    const pool = getPool();

    // Look up user by email
    const [[user]] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify bcrypt password hash
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Update last_login
    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const response = NextResponse.json({
      success: true,
      user: { name: user.full_name, email: user.email, role: user.role },
    });

    // Set an HTTP-only cookie with a session token
    // (For production, use a signed JWT. For now, encode the user id.)
    const token = Buffer.from(JSON.stringify({ uid: user.id, email: user.email, role: user.role })).toString('base64');

    response.cookies.set('auth_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day
    });

    // Also set default company if user has one
    if (user.company_id) {
      response.cookies.set('active_company', user.company_id, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_session');
  return response;
}
