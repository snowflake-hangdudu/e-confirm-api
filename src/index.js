import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db.js'
import { authMiddleware, signToken, verifyLogin } from './auth.js'
import { BODY_PARTS, DEPARTMENTS } from './catalog.js'
import {
  dashboardStats,
  deleteRecord,
  getRecord,
  listDepartments,
  listRecords,
  normalizeRecord,
  replaceRecord,
  upsertRecords,
} from './records.js'
import { seedIfEmpty } from './seed.js'

process.env.TZ = process.env.TZ || 'Asia/Shanghai'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors({ origin: true }))
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'e-confirm-api' })
})

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  if (!verifyLogin(username, password)) {
    res.status(401).json({ message: '账号或密码错误' })
    return
  }
  const user = {
    username,
    displayName: username === 'admin' ? '系统管理员' : username,
  }
  res.json({ token: signToken(username), user })
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json(req.user)
})

app.get('/api/dashboard', authMiddleware, async (_req, res) => {
  try {
    res.json(await dashboardStats())
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '统计失败' })
  }
})

app.get('/api/catalog/body-parts', authMiddleware, (_req, res) => {
  res.json(BODY_PARTS)
})

app.get('/api/catalog/departments', authMiddleware, (_req, res) => {
  res.json(DEPARTMENTS)
})

app.get('/api/records/departments', authMiddleware, async (_req, res) => {
  try {
    res.json(await listDepartments())
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '科室列表失败' })
  }
})

app.get('/api/records', authMiddleware, async (req, res) => {
  try {
    res.json(
      await listRecords({
        from: req.query.from,
        to: req.query.to,
        department: req.query.department,
        firstPickCorrect: req.query.firstPickCorrect,
      }),
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '查询失败' })
  }
})

app.get('/api/records/:id', authMiddleware, async (req, res) => {
  try {
    const row = await getRecord(String(req.params.id || ''))
    if (!row) {
      res.status(404).json({ message: '记录不存在' })
      return
    }
    res.json(row)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '查询失败' })
  }
})

app.post('/api/records', authMiddleware, async (req, res) => {
  const raw = Array.isArray(req.body?.records)
    ? req.body.records
    : Array.isArray(req.body)
      ? req.body
      : [req.body]
  const records = raw.map(normalizeRecord).filter(Boolean)
  if (!records.length) {
    res.status(400).json({ message: '没有有效的确认记录' })
    return
  }
  try {
    const upserted = await upsertRecords(records)
    res.json({ ok: true, upserted })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '保存失败' })
  }
})

app.put('/api/records/:id', authMiddleware, async (req, res) => {
  const id = String(req.params.id || '').trim()
  const existing = await getRecord(id).catch(() => null)
  if (!existing) {
    res.status(404).json({ message: '记录不存在' })
    return
  }
  const next = normalizeRecord({ ...existing, ...req.body, id })
  if (!next) {
    res.status(400).json({ message: '记录不完整' })
    return
  }
  try {
    await replaceRecord(next)
    res.json({ ok: true, record: next })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '保存失败' })
  }
})

app.delete('/api/records/:id', authMiddleware, async (req, res) => {
  try {
    const ok = await deleteRecord(String(req.params.id || ''))
    if (!ok) {
      res.status(404).json({ message: '记录不存在' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: '删除失败' })
  }
})

async function main() {
  await initDb()
  await seedIfEmpty()
  app.listen(port, '127.0.0.1', () => {
    console.log(`e-confirm-api listening on 127.0.0.1:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
