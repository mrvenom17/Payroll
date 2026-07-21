import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createSessionToken } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password, tenantCode } = await request.json();
    const pool = getPool();

    if (!tenantCode) {
      return NextResponse.json({ error: 'Tenant Code is required' }, { status: 400 });
    }

    let companyId = null;
    if (tenantCode !== 'ADMIN') {
      const [[company]] = await pool.execute('SELECT id FROM companies WHERE code = ?', [tenantCode]);
      if (!company) {
        return NextResponse.json({ error: 'Invalid Tenant Code' }, { status: 401 });
      }
      companyId = company.id;
    }

    // Look up user by email and company (or role if ADMIN)
    let userQuery = 'SELECT * FROM users WHERE email = ? AND is_active = 1';
    let userParams = [email];
    
    if (tenantCode === 'ADMIN') {
      userQuery += ' AND role = "super_admin"';
    } else {
      userQuery += ' AND company_id = ?';
      userParams.push(companyId);
    }

    const [[user]] = await pool.execute(userQuery, userParams);

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials or tenant' }, { status: 401 });
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

    // HMAC-signed token using Web Crypto API.
    const token = await createSessionToken({ uid: user.id, email: user.email, role: user.role, company_id: user.company_id });

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
