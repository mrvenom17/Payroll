import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const components = db.prepare(
      'SELECT * FROM salary_components WHERE is_active = 1 ORDER BY display_order ASC'
    ).all();
    return NextResponse.json({ components });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
