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

export async function login(email, password, role) {
  const body = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role })
  })
  saveToken(body.token)
  return body.user
}

export async function register(name, email, password, role) {
  const body = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role })
  })
  saveToken(body.token)
  return body.user
}

export async function getCurrentUser() {
  const body = await request('/api/auth/me')
  return body.user
}

if (typeof window !== 'undefined') {
  window.__elesLogin = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase()
    let lastError
    for (const role of ['student', 'instructor']) {
      try {
        await login(normalizedEmail, password, role)
        window.location.reload()
        return true
      } catch (error) {
        lastError = error
      }
    }
    window.alert(lastError?.message || 'Invalid email, password or account type.')
    return false
  }
}
