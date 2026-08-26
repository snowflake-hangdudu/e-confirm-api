import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'econfirm-dev-secret'
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || '123456'

export function signToken(username) {
  return jwt.sign(
    { sub: username, displayName: username === 'admin' ? '系统管理员' : username },
    JWT_SECRET,
    { expiresIn: '7d' },
  )
}

export function verifyLogin(username, password) {
  return username === ADMIN_USER && password === ADMIN_PASS
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) {
    res.status(401).json({ message: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = {
      username: payload.sub,
      displayName: payload.displayName || payload.sub,
    }
    next()
  } catch {
    res.status(401).json({ message: '登录已过期，请重新登录' })
  }
}
