import { NextResponse } from 'next/server';
import { getSecureCompanyId } from '@/lib/authHelper';
import { verifySessionToken } from '@/lib/auth';
import { getPool, generateId } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function GET(request) {
  try {
    const token = request.cookies.get('auth_session')?.value;
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPool();
    if (session.role === 'super_admin') {
      const [users] = await pool.execute(`
        SELECT id, email, full_name, role, company_id, is_active, last_login, created_at
        FROM users
        ORDER BY created_at DESC
      `);
      return NextResponse.json({ users });
    } else {
      const companyId = await getSecureCompanyId(request);
      const [users] = await pool.execute(`
        SELECT id, email, full_name, role, company_id, is_active, last_login, created_at
        FROM users
        WHERE company_id = ?
        ORDER BY created_at DESC
      `, [companyId]);
      return NextResponse.json({ users });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.cookies.get('auth_session')?.value;
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPool();
    const body = await request.json();
    let { email, password, full_name, role, company_id } = body;
    
    if (session.role !== 'super_admin') {
      company_id = await getSecureCompanyId(request);
      if (role === 'super_admin') role = 'admin'; // Cannot create super_admin
    }

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'email, password, and full_name are required' }, { status: 400 });
    }

    // Check duplicate
    const [[existing]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    const id = generateId();

    await pool.execute(`
      INSERT INTO users (id, email, password, full_name, role, company_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, email.toLowerCase(), hash, full_name, role || 'admin', company_id || null]);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error('POST /api/users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const token = request.cookies.get('auth_session')?.value;
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPool();
    const body = await request.json();
    const { id, action } = body;

    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const [[targetUser]] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (session.role !== 'super_admin') {
      const companyId = await getSecureCompanyId(request);
      if (targetUser.company_id !== companyId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    if (action === 'toggle_active') {
      await pool.execute('UPDATE users SET is_active = NOT is_active WHERE id = ?', [id]);
      return NextResponse.json({ success: true });
    }

    if (action === 'update_role') {
      const { role } = body;
      if (!['super_admin', 'admin', 'hr', 'viewer'].includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      await pool.execute('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      return NextResponse.json({ success: true });
    }

    if (action === 'reset_password') {
      const { new_password } = body;
      if (!new_password || new_password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      const hash = await bcrypt.hash(new_password, 12);
      await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
      return NextResponse.json({ success: true });
    }

    // Generic field updates
    const { full_name, email, company_id } = body;
    const updates = [];
    const params = [];
    if (full_name) { updates.push('full_name = ?'); params.push(full_name); }
    if (email) { updates.push('email = ?'); params.push(email.toLowerCase()); }
    if (company_id !== undefined) { updates.push('company_id = ?'); params.push(company_id || null); }

    if (updates.length > 0) {
      params.push(id);
      await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const token = request.cookies.get('auth_session')?.value;
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 });

    const [[targetUser]] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (session.role !== 'super_admin') {
      const companyId = await getSecureCompanyId(request);
      if (targetUser.company_id !== companyId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Don't hard-delete — deactivate
    await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
