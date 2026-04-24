import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('company') || request?.cookies?.get('active_company')?.value || 'comp_uabiotech';

    const departments = db.prepare(
      'SELECT * FROM departments WHERE company_id = ? ORDER BY name ASC'
    ).all(companyId);

    return NextResponse.json({ departments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
