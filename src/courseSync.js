const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://eles-api.onrender.com' : 'http://localhost:5000')).replace(/\/$/, '')
const TOKEN_KEY = 'eles_auth_token'

let syncing = false
let previousCourse = null
let lastSyncedSignature = ''

function token() {
  return sessionStorage.getItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const currentToken = token()
  if (!currentToken) throw new Error('Your session has expired. Please log in again.')

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${currentToken}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || 'Unable to synchronize course data.')
    error.status = response.status
    error.code = body.code
    throw error
  }
  return body
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function formatDate(value) {
  if (!value) return new Date().toLocaleString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function normalizeCourse(course = {}) {
  return {
    title: course.title || '',
    description: course.description || '',
    manual: course.manual || '',
    units: Array.isArray(course.units) ? course.units : [],
    assessments: Array.isArray(course.assessments) ? course.assessments : [],
    announcements: Array.isArray(course.announcements)
      ? course.announcements.map(item => ({
          id: item.id,
          title: item.title || '',
          message: item.message ?? item.content ?? '',
          author: item.author ?? item.author_name ?? '',
          date: item.date ?? formatDate(item.created_at)
        }))
      : [],
    forums: Array.isArray(course.forums)
      ? course.forums.map(topic => ({
          id: topic.id,
          topic: topic.topic ?? topic.title ?? '',
          createdBy: topic.createdBy ?? topic.author_name ?? '',
          messages: Array.isArray(topic.messages)
            ? topic.messages
            : [
                ...(topic.content ? [{
                  id: `opening-${topic.id}`,
                  userId: topic.author_id,
                  user: topic.author_name || '',
                  text: topic.content,
                  date: formatDate(topic.created_at)
                }] : []),
                ...(Array.isArray(topic.replies) ? topic.replies.map(reply => ({
                  id: reply.id,
                  userId: reply.author_id,
                  user: reply.author_name || '',
                  text: reply.content || '',
                  date: formatDate(reply.created_at)
                })) : [])
              ]
        }))
      : []
  }
}

async function fetchCourse() {
  const body = await request(`/api/course?_=${Date.now()}`)
  return normalizeCourse(body?.course)
}

// This function is ONLY for explicit instructor changes. It is never called
// automatically from browser storage. The database remains the source of truth.
export async function syncCourse(nextCourse) {
  if (!token() || syncing) return

  const next = normalizeCourse(nextCourse)
  const signature = JSON.stringify(next)
  if (signature === lastSyncedSignature) return

  const previous = previousCourse || normalizeCourse({})
  syncing = true

  try {
    if ((!same(previous.title, next.title) || !same(previous.description, next.description)) && next.title.trim()) {
      await request('/api/course/level', {
        method: 'PUT',
        body: JSON.stringify({ title: next.title, description: next.description })
      })
    }

    if (!same(previous.manual, next.manual)) {
      await request('/api/course/manual', {
        method: 'PUT',
        body: JSON.stringify({ manual: next.manual })
      })
    }

    const previousUnits = new Map(previous.units.map(unit => [String(unit.unitId), unit]))
    for (const unit of next.units) {
      const oldUnit = previousUnits.get(String(unit.unitId))
      if (!oldUnit || !same(oldUnit, unit)) {
        await request('/api/course/units', {
          method: 'POST',
          body: JSON.stringify({
            unitId: Number(unit.unitId),
            reference: unit.reference || '',
            title: unit.title,
            status: unit.status,
            description: unit.description || ''
          })
        })
      }
    }

    const previousTypes = previous.assessments.map(item => item.type).sort()
    const nextTypes = next.assessments.map(item => item.type).sort()
    if (!same(previousTypes, nextTypes)) {
      await request('/api/course/assessments', {
        method: 'PUT',
        body: JSON.stringify({ types: nextTypes })
      })
    }

    const previousAnnouncementIds = new Set(previous.announcements.map(item => String(item.id)))
    for (const announcement of next.announcements) {
      if (!previousAnnouncementIds.has(String(announcement.id))) {
        await request('/api/announcements', {
          method: 'POST',
          body: JSON.stringify({ title: announcement.title, content: announcement.message || '' })
        })
      }
    }

    const previousTopicIds = new Set(previous.forums.map(topic => String(topic.id)))
    for (const topic of next.forums) {
      if (!previousTopicIds.has(String(topic.id))) {
        const messages = Array.isArray(topic.messages) ? topic.messages : []
        const created = await request('/api/forum/topics', {
          method: 'POST',
          body: JSON.stringify({ title: topic.topic || '', content: messages[0]?.text || '' })
        })
        const serverTopicId = created?.id
        if (serverTopicId) {
          for (const reply of messages.slice(1)) {
            if (reply.text?.trim()) {
              await request(`/api/forum/topics/${serverTopicId}/replies`, {
                method: 'POST',
                body: JSON.stringify({ content: reply.text })
              })
            }
          }
        }
      } else {
        const oldTopic = previous.forums.find(item => String(item.id) === String(topic.id))
        const oldReplyIds = new Set((oldTopic?.messages || []).map(reply => String(reply.id)))
        for (const reply of topic.messages || []) {
          if (!oldReplyIds.has(String(reply.id)) && String(topic.id).match(/^\d+$/) && reply.text?.trim()) {
            await request(`/api/forum/topics/${topic.id}/replies`, {
              method: 'POST',
              body: JSON.stringify({ content: reply.text })
            })
          }
        }
      }
    }

    const refreshed = await fetchCourse()
    previousCourse = refreshed || next
    lastSyncedSignature = JSON.stringify(previousCourse)
    return previousCourse
  } finally {
    syncing = false
  }
}

export async function bootstrapCourseSync() {
  let course = null
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      course = await fetchCourse()
      if (course) break
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }

  if (!course && lastError) {
    console.error('ELES server course load failed:', lastError)
    throw lastError
  }

  if (course) {
    previousCourse = course
    lastSyncedSignature = JSON.stringify(course)
  }

  return course
}
