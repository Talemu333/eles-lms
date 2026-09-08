import { bootstrapCourseSync } from './courseSync.js'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')
const TOKEN_KEY = 'eles_auth_token'

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

function saveToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body.message || 'Unable to complete request.')
  }

  return body
}

// Role is deliberately NOT sent to the backend during login.
// The backend authenticates from email/password and returns the user's role.
// The selected Student/Instructor mode remains a frontend login context and
// is checked against the authenticated user's returned role.
export async function login(email, password, expectedRole = null) {
  const body = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })

  if (expectedRole && body.user?.role !== expectedRole) {
    clearToken()
    throw new Error(`This account is registered as ${body.user?.role === 'instructor' ? 'an instructor' : 'a student'}. Please select the correct account type.`)
  }

  saveToken(body.token)

  // The application may be authenticating for the first time on a new device.
  // Hydrate the shared course data immediately after the token exists so the
  // dashboard does not depend on pre-existing browser localStorage.
  await bootstrapCourseSync()

  return body.user
}

export async function register(name, email, password, role) {
  const body = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role })
  })
  saveToken(body.token)
  await bootstrapCourseSync()
  return body.user
}

export async function getCurrentUser() {
  const body = await request('/api/auth/me')
  return body.user
}

if (typeof window !== 'undefined') {
  window.__elesLogin = async (email, password) => {
    try {
      // Keep the original Student/Instructor switch as the login context,
      // while the backend itself remains role-independent at authentication time.
      const activeRoleButton = document.querySelector('.role-switch button.active')
      const selectedRole = activeRoleButton?.textContent?.trim().toLowerCase()
      await login(email.trim().toLowerCase(), password, selectedRole === 'student' || selectedRole === 'instructor' ? selectedRole : null)
      window.location.reload()
      return true
    } catch (error) {
      window.alert(error?.message || 'Invalid email or password.')
      return false
    }
  }
}
