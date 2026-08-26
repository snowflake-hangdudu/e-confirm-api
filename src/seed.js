import { pool } from './db.js'
import { upsertRecords } from './records.js'

function daysAgo(days, hour, minute) {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const DEMO = [
  {
    id: 'demo-001',
    confirmedAt: daysAgo(0, 8, 12),
    department: '骨科',
    admissionNo: 'ZY20260825001',
    firstPickCorrect: true,
    confirmerName: '李家属',
    siteLabels: ['左膝'],
    role: 'family',
    nurseName: '访视护士',
    patientName: '张三',
  },
  {
    id: 'demo-002',
    confirmedAt: daysAgo(0, 9, 40),
    department: '普外科',
    admissionNo: 'ZY20260825002',
    firstPickCorrect: false,
    confirmerName: '王患者',
    siteLabels: ['右腹股沟'],
    role: 'patient',
    nurseName: '访视护士',
    patientName: '王患者',
  },
  {
    id: 'demo-003',
    confirmedAt: daysAgo(1, 10, 18),
    department: '骨科',
    admissionNo: 'ZY20260824011',
    firstPickCorrect: true,
    confirmerName: '刘家属',
    siteLabels: ['右髋'],
    role: 'family',
    nurseName: '访视护士',
    patientName: '刘七',
  },
]

export async function seedIfEmpty() {
  if (process.env.SEED_DEMO !== '1') return
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM confirm_records')
  if (rows[0].n > 0) return
  await upsertRecords(DEMO)
  console.log(`seeded ${DEMO.length} demo records`)
}
