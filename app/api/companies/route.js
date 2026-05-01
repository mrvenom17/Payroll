import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

const CODE_RE = /^[A-Z0-9_-]{2,50}$/;

export async function GET() {
  try {
    const pool = getPool();
    const [companies] = await pool.execute('SELECT * FROM companies ORDER BY created_at ASC');
    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const pool = getPool();

    const name = (data.name || '').trim();
    const code = (data.code || '').trim().toUpperCase();

    if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    if (!code) return NextResponse.json({ error: 'Company code is required' }, { status: 400 });
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: 'Code must be 2–50 chars: A–Z, 0–9, _ or -' }, { status: 400 });
    }

    const [[clash]] = await pool.execute('SELECT id FROM companies WHERE code = ?', [code]);
    if (clash) {
      return NextResponse.json({ error: `Company code "${code}" already exists` }, { status: 409 });
    }

    const id = generateId();
    await pool.execute(`
      INSERT INTO companies (id, name, code, address, gstin, pan, tan, pf_registration, esic_registration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, name, code, data.address || '', data.gstin || '',
      data.pan || '', data.tan || '', data.pf_registration || '', data.esic_registration || ''
    ]);

    const [[company]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [id]);
    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const pool = getPool();
    const data = await request.json();
    const { id } = data;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [[existing]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [id]);
    if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const updates = [];
    const values = [];
    const setIf = (key) => {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(data[key]);
      }
    };

    if (data.name !== undefined) {
      const nm = (data.name || '').trim();
      if (!nm) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      updates.push('name = ?'); values.push(nm);
    }
    if (data.code !== undefined) {
      const cd = (data.code || '').trim().toUpperCase();
      if (!CODE_RE.test(cd)) return NextResponse.json({ error: 'Code must be 2–50 chars: A–Z, 0–9, _ or -' }, { status: 400 });
      if (cd !== existing.code) {
        const [[clash]] = await pool.execute('SELECT id FROM companies WHERE code = ? AND id != ?', [cd, id]);
        if (clash) return NextResponse.json({ error: `Code "${cd}" already exists` }, { status: 409 });
      }
      updates.push('code = ?'); values.push(cd);
    }
    setIf('address');
    setIf('gstin');
    setIf('pan');
    setIf('tan');
    setIf('pf_registration');
    setIf('esic_registration');

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    values.push(id);
    await pool.execute(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, values);

    const [[company]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [id]);
    return NextResponse.json({ company });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [[company]] = await pool.execute('SELECT * FROM companies WHERE id = ?', [id]);
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const [[empCount]] = await pool.execute('SELECT COUNT(*) AS c FROM employees WHERE company_id = ?', [id]);
    const [[deptCount]] = await pool.execute('SELECT COUNT(*) AS c FROM departments WHERE company_id = ?', [id]);
    if (empCount.c > 0 || deptCount.c > 0) {
      return NextResponse.json({
        error: `Cannot delete — company has ${empCount.c} employee(s) and ${deptCount.c} department(s). Remove them first.`,
      }, { status: 409 });
    }

    await pool.execute('DELETE FROM companies WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
