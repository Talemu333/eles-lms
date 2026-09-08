const KEY = 'els_lms_data_v11'
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')
const TOKEN_KEY = 'eles_auth_token'

let syncing = false
let syncingFromServer = false
let previousCourse = null
let syncTimer = null

function token() {
  return sessionStorage.getItem(TOKEN_KEY)
}

async function request(path, options = {}) {
  const currentToken = token()
  if (!currentToken) return null

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${currentToken}`
    }
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Unable to synchronize course data.')
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
                ...(topic.content
                  ? [{
                      id: `opening-${topic.id}`,
                      userId: topic.author_id,
                      user: topic.author_name || '',
                      text: topic.content,
                      date: formatDate(topic.created_at)
                    }]
                  : []),
                ...(Array.isArray(topic.replies)
                  ? topic.replies.map(reply => ({
                      id: reply.id,
                      userId: reply.author_id,
                      user: reply.author_name || '',
                      text: reply.content || '',
                      date: formatDate(reply.created_at)
                    }))
                  : [])
              ]
        }))
      : []
  }
}

async function fetchCourse() {
  if (!token()) return null
  const body = await request('/api/course')
  return normalizeCourse(body?.course)
}

function writeCourse(course) {
  const current = JSON.parse(localStorage.getItem(KEY) || '{}')
  syncingFromServer = true
  try {
    localStorage.setItem(KEY, JSON.stringify({
      ...current,
      course: normalizeCourse(course)
    }))
  } finally {
    syncingFromServer = false
  }
}

async function syncCourse(nextCourse) {
  if (!token() || syncing || syncingFromServer) return
  const next = normalizeCourse(nextCourse)
  const previous = previousCourse || normalizeCourse({})
  syncing = true

  try {
    if (!same(previous.title, next.title) || !same(previous.description, next.description)) {
      if (next.title.trim()) {
        await request('/api/course/level', {
          method: 'PUT',
          body: JSON.stringify({ title: next.title, description: next.description })
        })
      }
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
          body: JSON.stringify({
            title: announcement.title,
            content: announcement.message || announcement.content || ''
          })
        })
      }
    }

    const previousTopicIds = new Set(previous.forums.map(topic => String(topic.id)))
    for (const topic of next.forums) {
      if (!previousTopicIds.has(String(topic.id))) {
        const messages = Array.isArray(topic.messages) ? topic.messages : []
        const created = await request('/api/forum/topics', {
          method: 'POST',
          body: JSON.stringify({
            title: topic.topic || topic.title || '',
            content: messages[0]?.text || topic.content || ''
          })
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
          if (!oldReplyIds.has(String(reply.id))) {
            const topicId = String(topic.id).match(/^\d+$/) ? topic.id : null
            if (topicId && reply.text?.trim()) {
              await request(`/api/forum/topics/${topicId}/replies`, {
                method: 'POST',
                body: JSON.stringify({ content: reply.text })
              })
            }
          }
        }
      }
    }

    const refreshed = await fetchCourse()
    if (refreshed) {
      previousCourse = refreshed
      writeCourse(refreshed)
    } else {
      previousCourse = next
    }
  } catch (error) {
    console.error('ELES course synchronization failed:', error)
    previousCourse = previous
  } finally {
    syncing = false
  }
}

export async function bootstrapCourseSync() {
  if (!token()) return

  try {
    const course = await fetchCourse()
    if (course) {
      previousCourse = course
      writeCourse(course)
    }
  } catch (error) {
    console.warn('ELES course data could not be loaded from the server:', error.message)
  }

  const originalSetItem = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (key, value) => {
    originalSetItem(key, value)
    if (key !== KEY || syncingFromServer || !token()) return

    try {
      const parsed = JSON.parse(value)
      if (!parsed?.course) return
      clearTimeout(syncTimer)
      syncTimer = setTimeout(() => syncCourse(parsed.course), 250)
    } catch {
      // Ignore unrelated/local malformed storage writes.
    }
  }
}
