import { NextResponse } from 'next/server';
import { getSecureCompanyId } from '@/lib/authHelper';
import { getPool, generateId } from '@/lib/db';
import { PRESET_DESIGNATIONS } from '@/lib/designations';

// Create the designations table if it doesn't exist yet, and seed the
// preset list for a company the first time it's touched (so the 21 presets
// carry over automatically — nothing is lost when moving to DB-managed).
async function ensureTable(pool, companyId) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS designations (
      id          VARCHAR(36) PRIMARY KEY,
      company_id  VARCHAR(36) NOT NULL,
      name        VARCHAR(255) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_desig_company_name (company_id, name)
    ) ENGINE=InnoDB
  `);

  if (!companyId) return;
  const [[{ c }]] = await pool.execute(
    'SELECT COUNT(*) AS c FROM designations WHERE company_id = ?',
    [companyId]
  );
  if (c > 0) return;

  for (const name of PRESET_DESIGNATIONS) {
    await pool.execute(
      'INSERT IGNORE INTO designations (id, company_id, name) VALUES (?, ?, ?)',
      [generateId(), companyId, name]
    );
  }
}

// GET — list designations for the active company (auto-seeded on first run)
export async function GET(request) {
  try {
    const pool = getPool();
    const companyId = await getSecureCompanyId(request);
    await ensureTable(pool, companyId);

    const [designations] = await pool.execute(
      'SELECT * FROM designations WHERE company_id = ? ORDER BY name ASC',
      [companyId]
    );
    return NextResponse.json({ designations });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — add a designation
// Body: { name }
export async function POST(request) {
  try {
    const pool = getPool();
    const body = await request.json();
    const companyId = await getSecureCompanyId(request);
    await ensureTable(pool, companyId);

    const name = (body.name || '').trim();

    if (!companyId) {
      return NextResponse.json({ error: 'No active company. Please create or select a company first.' }, { status: 400 });
    }
    const [[companyRow]] = await pool.execute('SELECT id FROM companies WHERE id = ?', [companyId]);
    if (!companyRow) {
      return NextResponse.json({ error: 'Active company no longer exists. Pick another from the top bar.' }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: 'Designation name is required' }, { status: 400 });
    if (name.length > 255) return NextResponse.json({ error: 'Designation is too long (max 255 chars)' }, { status: 400 });

    const [[clash]] = await pool.execute(
      'SELECT id FROM designations WHERE company_id = ? AND name = ?',
      [companyId, name]
    );
    if (clash) return NextResponse.json({ error: `"${name}" already exists` }, { status: 409 });

    const id = generateId();
    await pool.execute('INSERT INTO designations (id, company_id, name) VALUES (?, ?, ?)', [id, companyId, name]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), companyId, 'DESIGNATION_CREATED', 'designation', id, JSON.stringify({ name }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    const [[designation]] = await pool.execute('SELECT * FROM designations WHERE id = ?', [id]);
    return NextResponse.json({ designation }, { status: 201 });
  } catch (error) {
    console.error('POST /api/designations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — rename a designation (also re-labels employees currently on it)
// Body: { id, name }
export async function PUT(request) {
  try {
    const pool = getPool();
    const { id, name } = await request.json();
    const companyId = await getSecureCompanyId(request);
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const newName = (name || '').trim();
    if (!newName) return NextResponse.json({ error: 'Designation name is required' }, { status: 400 });
    if (newName.length > 255) return NextResponse.json({ error: 'Designation is too long (max 255 chars)' }, { status: 400 });

    const [[desig]] = await pool.execute('SELECT * FROM designations WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!desig) return NextResponse.json({ error: 'Designation not found' }, { status: 404 });

    if (newName !== desig.name) {
      const [[clash]] = await pool.execute(
        'SELECT id FROM designations WHERE company_id = ? AND name = ? AND id != ?',
        [companyId, newName, id]
      );
      if (clash) return NextResponse.json({ error: `"${newName}" already exists` }, { status: 409 });

      await pool.execute('UPDATE designations SET name = ? WHERE id = ?', [newName, id]);
      // Keep employees in sync with the renamed label.
      await pool.execute('UPDATE employees SET designation = ? WHERE company_id = ? AND designation = ?',
        [newName, companyId, desig.name]);

      try {
        await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateId(), companyId, 'DESIGNATION_RENAMED', 'designation', id, JSON.stringify({ from: desig.name, to: newName }), 'admin']);
      } catch (e) { console.error('audit:', e.message); }
    }

    const [[updated]] = await pool.execute('SELECT * FROM designations WHERE id = ?', [id]);
    return NextResponse.json({ designation: updated });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — remove a designation (only if no employee is assigned to it)
export async function DELETE(request) {
  try {
    const pool = getPool();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const companyId = await getSecureCompanyId(request);
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const [[desig]] = await pool.execute('SELECT * FROM designations WHERE id = ? AND company_id = ?', [id, companyId]);
    if (!desig) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [[countRow]] = await pool.execute(
      'SELECT COUNT(*) AS c FROM employees WHERE company_id = ? AND designation = ?',
      [companyId, desig.name]
    );
    if (countRow.c > 0) {
      return NextResponse.json({ error: `Cannot delete — ${countRow.c} employee${countRow.c === 1 ? '' : 's'} still assigned to "${desig.name}". Reassign them first.` }, { status: 409 });
    }

    await pool.execute('DELETE FROM designations WHERE id = ?', [id]);

    try {
      await pool.execute(`INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, details, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), companyId, 'DESIGNATION_DELETED', 'designation', id, JSON.stringify({ name: desig.name }), 'admin']);
    } catch (e) { console.error('audit:', e.message); }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
