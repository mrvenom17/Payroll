import { NextResponse } from 'next/server';
import { getPool, generateId } from '@/lib/db';

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

    if (!data.name || !data.code) {
      return NextResponse.json({ error: 'Company Name and Code are required' }, { status: 400 });
    }

    const id = generateId();
    await pool.execute(`
      INSERT INTO companies (id, name, code, address, gstin, pan, tan, pf_registration, esic_registration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, data.name, data.code, data.address || '', data.gstin || '',
      data.pan || '', data.tan || '', data.pf_registration || '', data.esic_registration || ''
    ]);

    return NextResponse.json({ success: true, company: { id, ...data } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
