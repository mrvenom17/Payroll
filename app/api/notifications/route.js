import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  try {
    const db = getDb();
    const notifications = db.prepare(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 20
    `).all();
    
    // Count unread
    const unreadRow = db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE is_read = 0`).get();

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
    const db = getDb();
    const id = 'notif_' + crypto.randomBytes(8).toString('hex');
    
    db.prepare(`
      INSERT INTO notifications (id, message, type, is_read) 
      VALUES (?, ?, ?, 0)
    `).run(id, message, type);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { action } = await request.json();
    const db = getDb();
    
    if (action === 'mark_all_read') {
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`).run();
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
