import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import 'dotenv/config'
import pool from './db.js'
import { requireAuth, requireRole, signToken } from './middleware/auth.js'

const app = express()
const port = Number(process.env.PORT || 5000)

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin not allowed by CORS'))
  },
  credentials: true
}))
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    const [[counts]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM levels) AS levels,
        (SELECT COUNT(*) FROM units) AS units,
        (SELECT COUNT(*) FROM units WHERE instructor_id IS NOT NULL) AS assigned_units,
        (SELECT COUNT(*) FROM assessments) AS assessments,
        (SELECT COUNT(*) FROM announcements) AS announcements,
        (SELECT COUNT(*) FROM forum_topics) AS forum_topics
    `)
    const [[level]] = await pool.query('SELECT id, title, description FROM levels ORDER BY id LIMIT 1')
    const [assessmentRows] = await pool.query('SELECT id, type FROM assessments ORDER BY id')
    res.json({
      status: 'ok',
      database: 'connected',
      databaseName: process.env.DB_NAME || 'defaultdb',
      course: {
        levelId: level?.id ?? null,
        title: level?.title || '',
        description: level?.description || ''
      },
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
      assessmentTypes: assessmentRows.map(item => item.type)
    })
  } catch (error) {
    console.error(error)
    res.status(503).json({ status: 'error', database: 'unavailable' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!String(name || '').trim() || !normalizedEmail || !password || !['student', 'instructor'].includes(role)) {
      return res.status(400).json({ message: 'Name, email, password and account type are required.' })
    }
    if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail])
    if (existing.length) return res.status(409).json({ message: 'An account with this email already exists.' })
    const passwordHash = await bcrypt.hash(String(password), 12)
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [String(name).trim(), normalizedEmail, passwordHash, role])
    const user = { id: result.insertId, name: String(name).trim(), email: normalizedEmail, role }
    res.status(201).json({ user, token: signToken(user) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to create account.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const [rows] = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1', [normalizedEmail])
    if (!rows.length || !(await bcrypt.compare(String(password || ''), rows[0].password_hash))) return res.status(401).json({ message: 'Invalid email or password.' })
    const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role }
    res.json({ user, token: signToken(user) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to log in.' })
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1', [req.user.id])
    if (!rows.length) return res.status(404).json({ message: 'User account not found.' })
    res.json({ user: rows[0] })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to load account.' })
  }
})

\n// PASSWORD_RESET_IMPLEMENTED\nconst PASSWORD_RESET_TABLE_SQL = \`\n  CREATE TABLE IF NOT EXISTS password_reset_tokens (\n    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,\n    user_id BIGINT UNSIGNED NOT NULL,\n    token_hash CHAR(64) NOT NULL UNIQUE,\n    expires_at DATETIME NOT NULL,\n    used_at DATETIME NULL,\n    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,\n    INDEX idx_password_reset_user (user_id),\n    INDEX idx_password_reset_expires (expires_at)\n  ) ENGINE=InnoDB\n\`\n\nasync function ensurePasswordResetTable() {\n  await pool.query(PASSWORD_RESET_TABLE_SQL)\n}\n\nfunction hashResetToken(token) {\n  return createHash('sha256').update(token).digest('hex')\n}\n\nasync function sendPasswordResetEmail(to, resetUrl) {\n  const apiKey = process.env.RESEND_API_KEY\n  const from = process.env.MAIL_FROM || 'ELES LMS <noreply@eles-lms.org>'\n  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.')\n\n  const response = await fetch('https://api.resend.com/emails', {\n    method: 'POST',\n    headers: {\n      Authorization: \`Bearer \${apiKey}\`,\n      'Content-Type': 'application/json'\n    },\n    body: JSON.stringify({\n      from,\n      to: [to],\n      subject: 'Reset your ELES LMS password',\n      html: \`\n        <div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:auto">\n          <h2>ELES LMS Password Reset</h2>\n          <p>We received a request to reset your ELES LMS password.</p>\n          <p><a href="\${resetUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>\n          <p>This link expires in 1 hour and can only be used once.</p>\n          <p>If you did not request this, you can safely ignore this email.</p>\n        </div>\n      \`\n    })\n  })\n\n  const body = await response.json().catch(() => ({}))\n  if (!response.ok) throw new Error(body.message || 'Resend rejected the email.')\n}\n\napp.post('/api/auth/forgot-password', async (req, res) => {\n  const normalizedEmail = String(req.body?.email || '').trim().toLowerCase()\n  if (!normalizedEmail) return res.status(400).json({ message: 'Email is required.' })\n\n  try {\n    await ensurePasswordResetTable()\n    const [users] = await pool.query('SELECT id, email FROM users WHERE email = ? LIMIT 1', [normalizedEmail])\n\n    // Always return the same message so the endpoint does not reveal whether an email is registered.\n    if (users.length) {\n      const user = users[0]\n      const token = randomBytes(32).toString('hex')\n      const tokenHash = hashResetToken(token)\n      await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < NOW() OR used_at IS NOT NULL', [user.id])\n      await pool.query(\n        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',\n        [user.id, tokenHash]\n      )\n\n      const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\\/$/, '')\n      const resetUrl = \`\${appUrl}/?reset=\${encodeURIComponent(token)}\`\n\n      try {\n        await sendPasswordResetEmail(user.email, resetUrl)\n      } catch (mailError) {\n        console.error('[password-reset-email]', mailError)\n        await pool.query('DELETE FROM password_reset_tokens WHERE token_hash = ?', [tokenHash])\n      }\n    }\n\n    return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' })\n  } catch (error) {\n    console.error('[forgot-password]', error)\n    return res.status(500).json({ message: 'Unable to process the password reset request.' })\n  }\n})\n\napp.post('/api/auth/reset-password', async (req, res) => {\n  const token = String(req.body?.token || '').trim()\n  const password = String(req.body?.password || '')\n  if (!token || !password) return res.status(400).json({ message: 'Reset token and new password are required.' })\n  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' })\n\n  const connection = await pool.getConnection()\n  try {\n    await connection.beginTransaction()\n    await connection.query(PASSWORD_RESET_TABLE_SQL)\n    const tokenHash = hashResetToken(token)\n    const [rows] = await connection.query(\n      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE',\n      [tokenHash]\n    )\n    if (!rows.length) {\n      await connection.rollback()\n      return res.status(400).json({ message: 'This password reset link is invalid or has expired.' })\n    }\n\n    const passwordHash = await bcrypt.hash(password, 12)\n    await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, rows[0].user_id])\n    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id])\n    await connection.query('DELETE FROM password_reset_tokens WHERE user_id = ? AND id <> ?', [rows[0].user_id, rows[0].id])\n    await connection.commit()\n    return res.json({ message: 'Password reset successful. You can now log in with your new password.' })\n  } catch (error) {\n    await connection.rollback()\n    console.error('[reset-password]', error)\n    return res.status(500).json({ message: 'Unable to reset the password.' })\n  } finally {\n    connection.release()\n  }\n})\n
// Course data is always read from the server/database. Do not use browser
// storage as a source of truth. Keep this query compatible with the existing
// Aiven schema: teaching_manual is optional and is therefore loaded separately.
app.get('/api/course', requireAuth, async (_req, res) => {
  try {
    const [[level]] = await pool.query('SELECT id, title, description FROM levels ORDER BY id LIMIT 1')
    if (!level) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      return res.json({ course: { title: '', description: '', manual: '', units: [], assessments: [], announcements: [], forums: [] } })
    }

    let manual = ''
    try {
      const [manualRows] = await pool.query(`SELECT teaching_manual FROM levels WHERE id = ? LIMIT 1`, [level.id])
      manual = manualRows[0]?.teaching_manual || ''
    } catch (manualError) {
      if (manualError.code !== 'ER_BAD_FIELD_ERROR') throw manualError
    }

    const [units] = await pool.query(`
      SELECT u.id, u.unit_number, u.unit_code, u.title, u.status, u.description,
             u.instructor_id, instructor.name AS instructor_name
      FROM units u
      LEFT JOIN users instructor ON instructor.id = u.instructor_id
      WHERE u.level_id = ?
      ORDER BY u.unit_number
    `, [level.id])

    const [assessments] = await pool.query('SELECT id, type FROM assessments WHERE level_id = ? ORDER BY id', [level.id])

    const [announcements] = await pool.query(`
      SELECT a.id, a.title, a.content, a.author_id, u.name AS author_name, a.created_at, a.updated_at
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      WHERE a.level_id = ? OR a.level_id IS NULL
      ORDER BY a.created_at DESC
    `, [level.id])

    const [topics] = await pool.query(`
      SELECT t.id, t.title, t.content, t.author_id, u.name AS author_name, t.created_at, t.updated_at
      FROM forum_topics t
      JOIN users u ON u.id = t.author_id
      WHERE t.level_id = ? OR t.level_id IS NULL
      ORDER BY t.created_at DESC
    `, [level.id])

    const forums = []
    for (const topic of topics) {
      const [replies] = await pool.query(`
        SELECT r.id, r.content, r.author_id, u.name AS author_name, r.created_at, r.updated_at
        FROM forum_replies r
        JOIN users u ON u.id = r.author_id
        WHERE r.topic_id = ?
        ORDER BY r.created_at ASC
      `, [topic.id])
      forums.push({ ...topic, replies })
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    return res.json({
      course: {
        title: level.title,
        description: level.description || '',
        manual,
        units: units.map(u => ({
          id: u.id,
          unitId: String(u.unit_number).padStart(2, '0'),
          number: `Unit ${String(u.unit_number).padStart(2, '0')}`,
          reference: u.unit_code,
          title: u.title,
          status: u.status,
          description: u.description || '',
          instructorId: u.instructor_id,
          instructorName: u.instructor_name || ''
        })),
        assessments,
        announcements,
        forums
      }
    })
  } catch (error) {
    console.error('[course]', error)
    res.status(500).json({ message: 'Unable to load course data.', code: error.code || 'COURSE_LOAD_FAILED' })
  }
})

app.put('/api/course/level', requireAuth, requireRole('instructor'), async (req, res) => {
  const { title, description = '' } = req.body
  if (!String(title || '').trim()) return res.status(400).json({ message: 'Enter a level title.' })
  try {
    const [[existing]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    if (existing) {
      await pool.query('UPDATE levels SET title = ?, description = ? WHERE id = ?', [String(title).trim(), String(description).trim(), existing.id])
      return res.json({ message: 'Level saved.' })
    }
    await pool.query('INSERT INTO levels (title, description) VALUES (?, ?)', [String(title).trim(), String(description).trim()])
    res.status(201).json({ message: 'Level saved.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to save level.' })
  }
})

app.put('/api/course/manual', requireAuth, requireRole('instructor'), async (req, res) => {
  try {
    const { manual = '' } = req.body
    const [[existing]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    if (!existing) return res.status(400).json({ message: 'Set a level first.' })
    try {
      await pool.query('UPDATE levels SET teaching_manual = ? WHERE id = ?', [String(manual), existing.id])
    } catch (error) {
      if (error.code === 'ER_BAD_FIELD_ERROR') return res.status(409).json({ message: 'Teaching manual storage is not available in the current database schema.' })
      throw error
    }
    res.json({ message: 'Teaching manual saved.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to save teaching manual.' })
  }
})

app.post('/api/course/units', requireAuth, requireRole('instructor'), async (req, res) => {
  const { unitId, reference = '', title, status = 'Mandatory', description = '' } = req.body
  if (!Number.isInteger(Number(unitId)) || !String(title || '').trim()) return res.status(400).json({ message: 'Unit number and title are required.' })
  try {
    const [[level]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    if (!level) return res.status(400).json({ message: 'Set a level first.' })
    const [[existing]] = await pool.query('SELECT id, instructor_id FROM units WHERE level_id = ? AND unit_number = ? LIMIT 1', [level.id, Number(unitId)])
    if (existing && existing.instructor_id && Number(existing.instructor_id) !== Number(req.user.id)) return res.status(409).json({ message: 'This unit is already assigned to another instructor.' })
    if (existing) {
      await pool.query('UPDATE units SET unit_code = ?, title = ?, status = ?, description = ?, instructor_id = ? WHERE id = ?', [String(reference), String(title).trim(), String(status), String(description), req.user.id, existing.id])
      return res.json({ message: 'Unit saved.' })
    }
    await pool.query('INSERT INTO units (level_id, unit_number, unit_code, title, status, description, instructor_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [level.id, Number(unitId), String(reference), String(title).trim(), String(status), String(description), req.user.id])
    res.status(201).json({ message: 'Unit saved.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to save unit.' })
  }
})

app.put('/api/course/assessments', requireAuth, requireRole('instructor'), async (req, res) => {
  try {
    const { types = [] } = req.body
    const [[level]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    if (!level) return res.status(400).json({ message: 'Set a level first.' })
    await pool.query('DELETE FROM assessments WHERE level_id = ?', [level.id])
    for (const type of [...new Set(types.map(value => String(value).trim()).filter(Boolean))]) await pool.query('INSERT INTO assessments (level_id, type) VALUES (?, ?)', [level.id, type])
    res.json({ message: 'Assessment methods saved.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to save assessment methods.' })
  }
})

app.post('/api/announcements', requireAuth, requireRole('instructor'), async (req, res) => {
  try {
    const { title, content = '' } = req.body
    if (!String(title || '').trim()) return res.status(400).json({ message: 'Announcement title is required.' })
    const [[level]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    const [result] = await pool.query('INSERT INTO announcements (level_id, author_id, title, content) VALUES (?, ?, ?, ?)', [level?.id || null, req.user.id, String(title).trim(), String(content)])
    res.status(201).json({ id: result.insertId, message: 'Announcement posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post announcement.' })
  }
})

app.delete('/api/announcements/:announcementId', requireAuth, requireRole('instructor'), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM announcements WHERE id = ?', [req.params.announcementId])
    if (!result.affectedRows) return res.status(404).json({ message: 'Announcement not found.' })
    res.json({ message: 'Announcement deleted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to delete announcement.' })
  }
})

app.post('/api/forum/topics', requireAuth, async (req, res) => {
  try {
    const { title, content = '' } = req.body
    if (!String(title || '').trim()) return res.status(400).json({ message: 'Topic title is required.' })
    const [[level]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    const [result] = await pool.query('INSERT INTO forum_topics (level_id, author_id, title, content) VALUES (?, ?, ?, ?)', [level?.id || null, req.user.id, String(title).trim(), String(content)])
    res.status(201).json({ id: result.insertId, message: 'Forum topic posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post forum topic.' })
  }
})

app.delete('/api/forum/topics/:topicId', requireAuth, requireRole('instructor'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM forum_replies WHERE topic_id = ?', [req.params.topicId])
    const [result] = await connection.query('DELETE FROM forum_topics WHERE id = ?', [req.params.topicId])
    if (!result.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: 'Forum topic not found.' })
    }
    await connection.commit()
    res.json({ message: 'Forum topic deleted.' })
  } catch (error) {
    await connection.rollback()
    console.error(error)
    res.status(500).json({ message: 'Unable to delete forum topic.' })
  } finally {
    connection.release()
  }
})

app.post('/api/forum/topics/:topicId/replies', requireAuth, async (req, res) => {
  try {
    const { content = '' } = req.body
    if (!String(content).trim()) return res.status(400).json({ message: 'Reply content is required.' })
    const [result] = await pool.query('INSERT INTO forum_replies (topic_id, author_id, content) VALUES (?, ?, ?)', [req.params.topicId, req.user.id, String(content)])
    res.status(201).json({ id: result.insertId, message: 'Reply posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post reply.' })
  }
})

app.listen(port, () => console.log(`ELES API listening on ${port}`))
