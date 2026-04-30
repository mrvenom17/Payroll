import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  try {
    const pool = getPool();
    const [notifications] = await pool.execute(`
      SELECT * FROM notifications
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Count unread
    const [[unreadRow]] = await pool.execute(`SELECT COUNT(*) as c FROM notifications WHERE is_read = 0`);

    return NextResponse.json({
      notifications,
      unreadCount: unreadRow.c
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { message, type = 'info' } = await request.json();
    const pool = getPool();
    const id = 'notif_' + crypto.randomBytes(8).toString('hex');

    await pool.execute(`
      INSERT INTO notifications (id, message, type, is_read)
      VALUES (?, ?, ?, 0)
    `, [id, message, type]);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { action } = await request.json();
    const pool = getPool();

    if (action === 'mark_all_read') {
      await pool.execute(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
