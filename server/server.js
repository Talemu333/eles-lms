import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
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
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' })
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail])
    if (existing.length) return res.status(409).json({ message: 'An account with this email already exists.' })

    const passwordHash = await bcrypt.hash(String(password), 12)
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [String(name).trim(), normalizedEmail, passwordHash, role]
    )

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
    const [rows] = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ? LIMIT 1',
      [normalizedEmail]
    )
    if (!rows.length || !(await bcrypt.compare(String(password || ''), rows[0].password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

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

app.get('/api/course', requireAuth, async (_req, res) => {
  try {
    const [[level]] = await pool.query('SELECT id, title, description, teaching_manual AS manual FROM levels ORDER BY id LIMIT 1')
    if (!level) return res.json({ course: { title: '', description: '', manual: '', units: [], assessments: [], announcements: [], forums: [] } })

    const [units] = await pool.query(`
      SELECT u.id, u.unit_number, u.unit_code, u.title, u.status, u.description,
             u.instructor_id, instructor.name AS instructor_name
      FROM units u
      LEFT JOIN users instructor ON instructor.id = u.instructor_id
      WHERE u.level_id = ? AND u.instructor_id IS NOT NULL
      ORDER BY u.unit_number
    `, [level.id])
    const [assessments] = await pool.query('SELECT id, type FROM assessments WHERE level_id = ? ORDER BY id', [level.id])
    const [announcements] = await pool.query(`
      SELECT a.id, a.title, a.content, a.author_id, u.name AS author_name, a.created_at, a.updated_at
      FROM announcements a JOIN users u ON u.id = a.author_id
      WHERE a.level_id = ? OR a.level_id IS NULL ORDER BY a.created_at DESC
    `, [level.id])
    const [topics] = await pool.query(`
      SELECT t.id, t.title, t.content, t.author_id, u.name AS author_name, t.created_at, t.updated_at
      FROM forum_topics t JOIN users u ON u.id = t.author_id
      WHERE t.level_id = ? OR t.level_id IS NULL ORDER BY t.created_at DESC
    `, [level.id])

    const forums = []
    for (const topic of topics) {
      const [replies] = await pool.query(`
        SELECT r.id, r.content, r.author_id, u.name AS author_name, r.created_at, r.updated_at
        FROM forum_replies r JOIN users u ON u.id = r.author_id
        WHERE r.topic_id = ? ORDER BY r.created_at ASC
      `, [topic.id])
      forums.push({ ...topic, replies })
    }

    res.json({
      course: {
        title: level.title,
        description: level.description || '',
        manual: level.manual || '',
        units: units.map(u => ({
          id: u.id, unitId: String(u.unit_number).padStart(2, '0'), number: `Unit ${String(u.unit_number).padStart(2, '0')}`,
          reference: u.unit_code, title: u.title, status: u.status, description: u.description || '',
          instructorId: u.instructor_id, instructorName: u.instructor_name || ''
        })),
        assessments,
        announcements,
        forums
      }
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to load course data.' })
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
    await pool.query('UPDATE levels SET teaching_manual = ? WHERE id = ?', [String(manual), existing.id])
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
    if (existing && existing.instructor_id && Number(existing.instructor_id) !== Number(req.user.id)) {
      return res.status(409).json({ message: 'This unit is already assigned to another instructor.' })
    }
    if (existing) {
      await pool.query(
        'UPDATE units SET unit_code = ?, title = ?, status = ?, description = ?, instructor_id = ? WHERE id = ?',
        [String(reference), String(title).trim(), String(status), String(description), req.user.id, existing.id]
      )
      return res.json({ message: 'Unit saved.' })
    }
    await pool.query(
      'INSERT INTO units (level_id, unit_number, unit_code, title, status, description, instructor_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [level.id, Number(unitId), String(reference), String(title).trim(), String(status), String(description), req.user.id]
    )
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
    for (const type of [...new Set(types.map(value => String(value).trim()).filter(Boolean))]) {
      await pool.query('INSERT INTO assessments (level_id, type) VALUES (?, ?)', [level.id, type])
    }
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
    const [result] = await pool.query(
      'INSERT INTO announcements (level_id, author_id, title, content) VALUES (?, ?, ?, ?)',
      [level?.id || null, req.user.id, String(title).trim(), String(content)]
    )
    res.status(201).json({ id: result.insertId, message: 'Announcement posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post announcement.' })
  }
})

app.post('/api/forum/topics', requireAuth, async (req, res) => {
  try {
    const { title, content = '' } = req.body
    if (!String(title || '').trim()) return res.status(400).json({ message: 'Topic title is required.' })
    const [[level]] = await pool.query('SELECT id FROM levels ORDER BY id LIMIT 1')
    const [result] = await pool.query(
      'INSERT INTO forum_topics (level_id, author_id, title, content) VALUES (?, ?, ?, ?)',
      [level?.id || null, req.user.id, String(title).trim(), String(content)]
    )
    res.status(201).json({ id: result.insertId, message: 'Forum topic posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post forum topic.' })
  }
})

app.post('/api/forum/topics/:topicId/replies', requireAuth, async (req, res) => {
  try {
    const { content = '' } = req.body
    if (!String(content).trim()) return res.status(400).json({ message: 'Reply content is required.' })
    const [result] = await pool.query(
      'INSERT INTO forum_replies (topic_id, author_id, content) VALUES (?, ?, ?)',
      [req.params.topicId, req.user.id, String(content)]
    )
    res.status(201).json({ id: result.insertId, message: 'Reply posted.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Unable to post reply.' })
  }
})

app.listen(port, () => console.log(`ELES API listening on ${port}`))
