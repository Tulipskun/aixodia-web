import { useEffect, useRef, useState } from 'react'

import * as api from './api'
import type { Session } from './types'
import { LiveConsole } from './console/LiveConsole'
import { Boot, LoginPage } from './components'

type Phase = 'boot' | 'login' | 'home'

/* Said only when the browser has come back from the Access hop and still has no
   session: it names what failed instead of showing the same button again. */
const SIGNIN_REFUSED =
  'Cloudflare Access let you through, but no session came back. Your address may not be on the allowlist for this console.'

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [session, setSession] = useState<Session | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const booted = useRef(false)

  useEffect(() => {
    // Cloudflare Access owns the login. The only local question is whether the
    // engine still accepts our Access session, and the engine answers that
    // with /api/auth/whoami. A network failure keeps the cached profile so a
    // stopped engine does not look like a signed-out user.
    if (booted.current) return
    booted.current = true
    api.refreshSession()
      .then(next => {
        setSession(next)
        if (!next.authenticated && api.takeSignInReturn()) setLoginError(SIGNIN_REFUSED)
        setPhase(next.authenticated ? 'home' : 'login')
      })
      .catch(() => {
        const cached = api.getSession()
        setSession(cached)
        setPhase(cached.authenticated ? 'home' : 'login')
      })
  }, [])

  useEffect(() => {
    // A 401/403 from the engine means Cloudflare Access rejected the request, so
    // the Access session is gone and the login page is the only way forward.
    api.setUnauthorizedHandler(() => {
      setSession(null)
      setPhase('login')
    })
    return () => api.setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (phase !== 'home') return
    const lockAuthenticatedHistory = () => {
      window.history.pushState({ aixodiaAuthenticated: true }, '', window.location.href)
    }
    window.history.replaceState({ aixodiaAuthenticated: true }, '', window.location.href)
    lockAuthenticatedHistory()
    window.addEventListener('popstate', lockAuthenticatedHistory)
    return () => window.removeEventListener('popstate', lockAuthenticatedHistory)
  }, [phase])

  useEffect(() => {
    if (!logoutConfirmOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLogoutConfirmOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [logoutConfirmOpen])

  /**
   * Sign in.
   *
   * Nothing is asked for: whoever is using the browser has already passed
   * Cloudflare Access, and the Worker reads that identity from the assertion. This
   * is a single round trip that either issues a session token or says the account
   * is not permitted.
   */
  /**
   * Sign in.
   *
   * The order matters. Cloudflare Access is what establishes identity, so the
   * browser has to pass through it before there is anything to exchange for a
   * session token. Asking the Worker first could only ever fail for a first-time
   * visitor: with no Access cookie there is no assertion to read, and the app
   * reported that as a broken session rather than sending them to sign in.
   *
   * So this navigates to the guarded endpoint, and Access either returns at once
   * (already signed in) or asks for a login and then returns. The app loads again
   * at its own address with the cookie present, and `refreshSession`
   * picks it up from there.
   */
  const handleSignIn = () => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      api.signIn()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Could not sign in.')
      setLoginBusy(false)
    }
  }

  const handleLogout = () => {
    setSession(null)
    setLogoutConfirmOpen(false)
    setPhase('login')
    // Cloudflare ends the Access session; the browser then comes back here.
    api.logout()
  }

  if (phase === 'boot') return <Boot label="Checking your session…" />

  if (phase === 'login') {
    return (
      <LoginPage
        onSignIn={handleSignIn}
        busy={loginBusy}
        error={loginError}
      />
    )
  }

  const signOutDialog = logoutConfirmOpen && (
    <div
      className="logout-confirm-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setLogoutConfirmOpen(false)
      }}
    >
      <section
        className="logout-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-description"
      >
        <div className="logout-confirm-icon" aria-hidden="true">↪</div>
        <h2 id="logout-confirm-title">Sign out?</h2>
        <p id="logout-confirm-description">Are you sure you want to sign out of your AIxodia account?</p>
        <div className="logout-confirm-actions">
          <button
            className="logout-confirm-cancel"
            type="button"
            autoFocus
            onClick={() => setLogoutConfirmOpen(false)}
          >
            Cancel
          </button>
          <button className="logout-confirm-submit" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  )

  /* The console is the whole surface: it draws its own bar, its own menu and its own
     lists, and the chat is one of its screens. Nothing sits around it. */
  return (
    <>
      <LiveConsole account={session?.username ?? ''} onSignOut={() => setLogoutConfirmOpen(true)} />
      {signOutDialog}
    </>
  )
}
