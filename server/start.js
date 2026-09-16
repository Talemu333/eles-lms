import http from 'node:http'
import { Readable } from 'node:stream'
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import pool from './db.js'

const publicPort = Number(process.env.PORT || 5000)
const internalPort = publicPort + 1
process.env.PORT = String(internalPort)

await import('./server.js')

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

const passwordResetTableReady = pool.query(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_reset_user (user_id),
    INDEX idx_password_reset_expires (expires_at)
  ) ENGINE=InnoDB
`)

function hashResetToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function setCors(res, origin) {
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Vary', 'Origin')
}

function isPasswordResetPath(pathname) {
  return pathname === '/api/auth/forgot-password' || pathname === '/api/auth/reset-password'
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

async function sendPasswordResetEmail({ to, name, token }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  const appUrl = String(process.env.APP_URL || '').replace(/\/$/, '')
  if (!apiKey || !from || !appUrl) throw new Error('Password reset email is not configured.')

  const resetUrl = `${appUrl}/?reset=${encodeURIComponent(token)}`
  const safeName = String(name || 'there').replace(/[<>&"']/g, '')
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'ELES-LMS/1.0'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Reset your ELES LMS password',
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto"><h2>Password Reset</h2><p>Hello ${safeName},</p><p>We received a request to reset your ELES LMS password.</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p><p>This link expires in <strong>1 hour</strong> and can only be used once.</p><p>If you did not request this, you can safely ignore this email.</p><p style="color:#666;font-size:13px">Early Learning Services — Learning Management System</p></div>`,
      text: `Hello ${safeName},\n\nReset your ELES LMS password using this link:\n${resetUrl}\n\nThis link expires in 1 hour and can only be used once. If you did not request this, you can ignore this email.`
    })
  })
  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Email provider rejected the reset email: ${response.status} ${details}`)
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function handleForgotPassword(req, res) {
  const genericMessage = 'If an account with that email exists, a password reset link has been sent.'
  const body = await readJson(req)
  const normalizedEmail = String(body.email || '').trim().toLowerCase()
  if (!normalizedEmail) return sendJson(res, 200, { message: genericMessage })

  try {
    await passwordResetTableReady
    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE email = ? LIMIT 1', [normalizedEmail])
    if (!user) return sendJson(res, 200, { message: genericMessage })

    const token = randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(token)
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [user.id])
    await pool.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))', [user.id, tokenHash])

    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, token })
    } catch (emailError) {
      await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash])
      console.error('[forgot-password email]', emailError)
      return sendJson(res, 500, { message: 'Unable to send the password reset email right now. Please try again later.' })
    }
    return sendJson(res, 200, { message: genericMessage })
  } catch (error) {
    console.error('[forgot-password]', error)
    return sendJson(res, 500, { message: 'Unable to process the password reset request right now.' })
  }
}

async function handleResetPassword(req, res) {
  const body = await readJson(req)
  const token = String(body.token || '').trim()
  const password = String(body.password || '')
  if (!token || password.length < 6) return sendJson(res, 400, { message: 'A valid reset token and a password of at least 6 characters are required.' })

  const connection = await pool.getConnection()
  try {
    await passwordResetTableReady
    await connection.beginTransaction()
    const tokenHash = hashResetToken(token)
    const [rows] = await connection.query('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE', [tokenHash])
    if (!rows.length) {
      await connection.rollback()
      return sendJson(res, 400, { message: 'This password reset link is invalid or has expired. Please request a new one.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, rows[0].user_id])
    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id])
    await connection.commit()
    return sendJson(res, 200, { message: 'Password reset successful. You can now log in with your new password.' })
  } catch (error) {
    await connection.rollback().catch(() => {})
    console.error('[reset-password]', error)
    return sendJson(res, 500, { message: 'Unable to reset the password right now.' })
  } finally {
    connection.release()
  }
}

async function proxyRequest(req, res) {
  const bodyChunks = []
  if (!['GET', 'HEAD'].includes(req.method)) {
    for await (const chunk of req) bodyChunks.push(chunk)
  }
  const headers = { ...req.headers }
  delete headers.host
  delete headers['content-length']

  try {
    const response = await fetch(`http://127.0.0.1:${internalPort}${req.url}`, {
      method: req.method,
      headers,
      body: bodyChunks.length ? Buffer.concat(bodyChunks) : undefined
    })
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch (error) {
    console.error('[api-proxy]', error)
    sendJson(res, 502, { message: 'API service is temporarily unavailable.' })
  }
}

const gateway = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname

  if (isPasswordResetPath(pathname)) {
    setCors(res, origin)
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      return res.end()
    }
    if (req.method === 'POST') {
      if (pathname === '/api/auth/forgot-password') return handleForgotPassword(req, res)
      return handleResetPassword(req, res)
    }
    return sendJson(res, 405, { message: 'Method not allowed.' })
  }
  return proxyRequest(req, res)
})

gateway.listen(publicPort, () => console.log(`ELES API gateway listening on ${publicPort}; application API on ${internalPort}`))
