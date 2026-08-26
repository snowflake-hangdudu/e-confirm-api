import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('缺少 DATABASE_URL')
}

export const pool = new pg.Pool({
  connectionString: url,
  max: 10,
})

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS confirm_records (
      id TEXT PRIMARY KEY,
      confirmed_at TIMESTAMPTZ NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      admission_no TEXT NOT NULL DEFAULT '',
      first_pick_correct BOOLEAN NOT NULL DEFAULT FALSE,
      confirmer_name TEXT NOT NULL DEFAULT '',
      site_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
      role TEXT NOT NULL DEFAULT 'patient',
      nurse_name TEXT NOT NULL DEFAULT '',
      patient_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE confirm_records
    ADD COLUMN IF NOT EXISTS signature_image TEXT NOT NULL DEFAULT ''
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS confirm_records_confirmed_at_idx
    ON confirm_records (confirmed_at DESC)
  `)
}

export function mapRow(row) {
  return {
    id: row.id,
    confirmedAt: new Date(row.confirmed_at).toISOString(),
    department: row.department,
    admissionNo: row.admission_no,
    firstPickCorrect: Boolean(row.first_pick_correct),
    confirmerName: row.confirmer_name,
    siteLabels: Array.isArray(row.site_labels) ? row.site_labels : [],
    role: row.role === 'family' ? 'family' : 'patient',
    nurseName: row.nurse_name,
    patientName: row.patient_name,
    signatureImage: row.signature_image || '',
    synced: true,
  }
}
