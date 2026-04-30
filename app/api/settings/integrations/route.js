import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(`SELECT * FROM system_settings`);
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
    const pool = getPool();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          await conn.execute(`
            INSERT INTO system_settings (setting_key, setting_value, updated_at)
            VALUES (?, ?, NOW())
            ON DUPLICATE KEY UPDATE
            setting_value = VALUES(setting_value),
            updated_at = NOW()
          `, [key, value.toString()]);
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
