import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT * FROM system_settings`).all();
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
    }
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const data = await request.json(); // { razorpay_key_id: '...', razorpay_key_secret: '...' }
    const db = getDb();
    
    const stmt = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_at) 
      VALUES (?, ?, datetime('now')) 
      ON CONFLICT(setting_key) DO UPDATE SET 
      setting_value = excluded.setting_value, 
      updated_at = datetime('now')
    `);

    // Use transaction for bulk save
    const transaction = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        if (value !== undefined && value !== null) {
          stmt.run(key, value.toString());
        }
      }
    });

    transaction(data);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
