import jwt from 'jsonwebtoken'
import pool from '../db.js'

export function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  )
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) return res.status(401).json({ message: 'Authentication required.' })

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

export function requireRole(...roles) {
  return async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' })
    }

    // Instructors may delete only content they personally created.
    // This is enforced on the server so it cannot be bypassed by editing
    // browser state or calling the DELETE endpoint directly.
    try {
      if (req.method === 'DELETE' && req.params?.announcementId) {
        const [[announcement]] = await pool.query(
          'SELECT author_id FROM announcements WHERE id = ? LIMIT 1',
          [req.params.announcementId]
        )
        if (!announcement) return res.status(404).json({ message: 'Announcement not found.' })
        if (Number(announcement.author_id) !== Number(req.user.id)) {
          return res.status(403).json({ message: 'You can only delete announcements you created.' })
        }
      }

      if (req.method === 'DELETE' && req.params?.topicId) {
        const [[topic]] = await pool.query(
          'SELECT author_id FROM forum_topics WHERE id = ? LIMIT 1',
          [req.params.topicId]
        )
        if (!topic) return res.status(404).json({ message: 'Forum topic not found.' })
        if (Number(topic.author_id) !== Number(req.user.id)) {
          return res.status(403).json({ message: 'You can only delete forum topics you created.' })
        }
      }
    } catch (error) {
      console.error('[ownership]', error)
      return res.status(500).json({ message: 'Unable to verify content ownership.' })
    }

    next()
  }
}
