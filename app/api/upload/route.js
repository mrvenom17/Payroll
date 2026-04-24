import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const entity_id = searchParams.get('entity_id');
    const db = getDb();
    
    let docs;
    if (entity_id) {
      docs = db.prepare(`SELECT * FROM documents WHERE entity_id = ? ORDER BY created_at DESC`).all(entity_id);
    } else {
      docs = db.prepare(`SELECT * FROM documents ORDER BY created_at DESC`).all();
    }
    
    return NextResponse.json({ documents: docs });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const entity_type = formData.get('entity_type');
    const entity_id = formData.get('entity_id');
    const tag = formData.get('tag');

    if (!file || !entity_id || !tag) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = 'doc_' + crypto.randomBytes(6).toString('hex');
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    // Create folders
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', entity_type || 'general', entity_id);
    await fs.mkdir(uploadDir, { recursive: true });
    
    const finalFilename = `${tag}_${id}_${safeFilename}`;
    const filePath = path.join(uploadDir, finalFilename);
    const publicUrl = `/uploads/${entity_type || 'general'}/${entity_id}/${finalFilename}`;
    
    await fs.writeFile(filePath, buffer);

    const db = getDb();
    db.prepare(`
      INSERT INTO documents (id, entity_type, entity_id, file_name, file_path, tag)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, entity_type || 'general', entity_id, file.name, publicUrl, tag);

    return NextResponse.json({ success: true, document: { id, publicUrl, file_name: file.name, tag } });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
