import { DEPARTMENTS } from './catalog.js'
import { mapRow, pool } from './db.js'

function asArray(value) {
  if (Array.isArray(value)) return value.filter((x) => typeof x === 'string')
  return []
}

export function normalizeRecord(input) {
  if (!input || typeof input !== 'object') return null
  const id = String(input.id || '').trim()
  const confirmedAt = String(input.confirmedAt || '').trim()
  if (!id || !confirmedAt || Number.isNaN(Date.parse(confirmedAt))) return null
  return {
    id,
    confirmedAt: new Date(confirmedAt).toISOString(),
    department: String(input.department || '').trim(),
    admissionNo: String(input.admissionNo || '').trim(),
    firstPickCorrect: Boolean(input.firstPickCorrect),
    confirmerName: String(input.confirmerName || '').trim(),
    siteLabels: asArray(input.siteLabels),
    role: input.role === 'family' ? 'family' : 'patient',
    nurseName: String(input.nurseName || '').trim(),
    patientName: String(input.patientName || '').trim(),
    signatureImage: clampSignature(input.signatureImage),
  }
}

function clampSignature(value) {
  if (typeof value !== 'string') return ''
  const s = value.trim()
  if (!s.startsWith('data:image/')) return ''
  if (s.length > 800_000) return s.slice(0, 800_000)
  return s
}

export async function upsertRecords(records) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const r of records) {
      await client.query(
        `INSERT INTO confirm_records (
           id, confirmed_at, department, admission_no, first_pick_correct,
           confirmer_name, site_labels, role, nurse_name, patient_name,
           signature_image
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           confirmed_at = EXCLUDED.confirmed_at,
           department = EXCLUDED.department,
           admission_no = EXCLUDED.admission_no,
           first_pick_correct = EXCLUDED.first_pick_correct,
           confirmer_name = EXCLUDED.confirmer_name,
           site_labels = EXCLUDED.site_labels,
           role = EXCLUDED.role,
           nurse_name = EXCLUDED.nurse_name,
           patient_name = EXCLUDED.patient_name,
           signature_image = CASE
             WHEN EXCLUDED.signature_image = '' THEN confirm_records.signature_image
             ELSE EXCLUDED.signature_image
           END`,
        [
          r.id,
          r.confirmedAt,
          r.department,
          r.admissionNo,
          r.firstPickCorrect,
          r.confirmerName,
          JSON.stringify(r.siteLabels),
          r.role,
          r.nurseName,
          r.patientName,
          r.signatureImage,
        ],
      )
    }
    await client.query('COMMIT')
    return records.length
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function listRecords(query) {
  const where = []
  const params = []
  if (query.from) {
    params.push(`${query.from}T00:00:00+08:00`)
    where.push(`confirmed_at >= $${params.length}`)
  }
  if (query.to) {
    params.push(`${query.to}T23:59:59.999+08:00`)
    where.push(`confirmed_at <= $${params.length}`)
  }
  if (query.department) {
    params.push(query.department)
    where.push(`department = $${params.length}`)
  }
  if (query.firstPickCorrect === 'true' || query.firstPickCorrect === true) {
    where.push('first_pick_correct = TRUE')
  } else if (query.firstPickCorrect === 'false' || query.firstPickCorrect === false) {
    where.push('first_pick_correct = FALSE')
  }
  const sql = `
    SELECT * FROM confirm_records
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY confirmed_at DESC
  `
  const { rows } = await pool.query(sql, params)
  return rows.map(mapRow)
}

export async function listDepartments() {
  const { rows } = await pool.query(`
    SELECT DISTINCT department
    FROM confirm_records
    WHERE department <> ''
    ORDER BY department
  `)
  return [...new Set([...DEPARTMENTS, ...rows.map((r) => r.department)])]
}

export async function replaceRecord(r) {
  await pool.query(
    `INSERT INTO confirm_records (
       id, confirmed_at, department, admission_no, first_pick_correct,
       confirmer_name, site_labels, role, nurse_name, patient_name,
       signature_image
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       confirmed_at = EXCLUDED.confirmed_at,
       department = EXCLUDED.department,
       admission_no = EXCLUDED.admission_no,
       first_pick_correct = EXCLUDED.first_pick_correct,
       confirmer_name = EXCLUDED.confirmer_name,
       site_labels = EXCLUDED.site_labels,
       role = EXCLUDED.role,
       nurse_name = EXCLUDED.nurse_name,
       patient_name = EXCLUDED.patient_name,
       signature_image = EXCLUDED.signature_image`,
    [
      r.id,
      r.confirmedAt,
      r.department,
      r.admissionNo,
      r.firstPickCorrect,
      r.confirmerName,
      JSON.stringify(r.siteLabels),
      r.role,
      r.nurseName,
      r.patientName,
      r.signatureImage,
    ],
  )
}

export async function getRecord(id) {
  const { rows } = await pool.query(
    'SELECT * FROM confirm_records WHERE id = $1',
    [id],
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export async function deleteRecord(id) {
  const { rowCount } = await pool.query(
    'DELETE FROM confirm_records WHERE id = $1',
    [id],
  )
  return rowCount > 0
}

export async function dashboardStats() {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE (confirmed_at AT TIME ZONE 'Asia/Shanghai')::date
          = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
      )::int AS today,
      COUNT(*) FILTER (
        WHERE confirmed_at >= NOW() - INTERVAL '7 days'
      )::int AS week,
      COUNT(*) FILTER (WHERE first_pick_correct)::int AS first_pick
  FROM confirm_records
  `)
  const row = rows[0] || { total: 0, today: 0, week: 0, first_pick: 0 }
  const total = row.total || 0
  return {
    todayCount: row.today || 0,
    weekCount: row.week || 0,
    totalCount: total,
    firstPickCount: row.first_pick || 0,
    firstPickRate: total ? Math.round((row.first_pick / total) * 1000) / 10 : 0,
  }
}
