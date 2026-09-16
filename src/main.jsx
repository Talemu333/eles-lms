import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { forgotPassword, resetPassword } from './api.js'
import './index.css'

function AuthMessage({ children }) {
  return children ? <div className="info-box" style={{ marginBottom: 16 }}>{children}</div> : null
}

function ResetField({ label, ...props }) {
  return <div className="form-group"><label>{label}</label><input {...props} /></div>
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email.trim()) return setMessage('Please enter your email address.')
    setBusy(true)
    try {
      const result = await forgotPassword(email.trim().toLowerCase())
      setMessage(result.message || 'If an account exists, a password reset link has been sent.')
    } catch (error) {
      setMessage(error.message || 'Unable to send the password reset email.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth"><div className="auth-box">
    <h1>Early Learning Services</h1>
    <p className="muted">Reset your ELES LMS password</p>
    {message && <AuthMessage>{message}</AuthMessage>}
    <ResetField label="Email" type="email" placeholder="Enter your account email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
    <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending...' : 'Send Reset Link'}</button>
    <button className="btn btn-light" onClick={() => { window.location.href = '/' }} disabled={busy}>Back to Login</button>
  </div></div>
}

function ResetPasswordPage({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password.length < 6) return setMessage('Password must be at least 6 characters.')
    if (password !== confirm) return setMessage('The passwords do not match.')
    setBusy(true)
    try {
      const result = await resetPassword(token, password)
      setMessage(result.message || 'Password reset successful. You can now log in.')
      setTimeout(() => { window.location.href = '/' }, 1200)
    } catch (error) {
      setMessage(error.message || 'Unable to reset the password.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth"><div className="auth-box">
    <h1>Early Learning Services</h1>
    <p className="muted">Choose a new password for your account.</p>
    {message && <AuthMessage>{message}</AuthMessage>}
    <ResetField label="New Password" type="password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
    <ResetField label="Confirm Password" type="password" placeholder="Enter password again" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} />
    <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Resetting Password...' : 'Reset Password'}</button>
    <button className="btn btn-light" onClick={() => { window.location.href = '/?forgot=1' }} disabled={busy}>Request New Link</button>
  </div></div>
}

const params = new URLSearchParams(window.location.search)
const resetToken = params.get('reset') || ''
const forgotMode = params.get('forgot') === '1'

// The existing login screen already contains the Forgot Password link. Capture
// that click before React handles it and move to the dedicated reset screen.
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href="#reset"]')
  if (!link) return
  event.preventDefault()
  event.stopImmediatePropagation()
  window.location.href = '/?forgot=1'
}, true)

let content = <App />
if (resetToken) content = <ResetPasswordPage token={resetToken} />
else if (forgotMode) content = <ForgotPasswordPage />

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{content}</React.StrictMode>
)
