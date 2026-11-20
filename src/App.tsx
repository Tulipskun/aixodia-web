import { useCallback, useEffect, useRef, useState } from 'react'

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
  /* Who is signed in was decided last time this browser was here, and Access keeps its
     own session for a day. Starting from the console when a profile is still in date is
     what makes a reload a reload: the console's own calls are the check, and a 401 sends
     the browser through Access again. */
  const starting = api.getSession()
  const [phase, setPhase] = useState<Phase>(starting.authenticated ? 'home' : 'boot')
  const [session, setSession] = useState<Session | null>(starting.authenticated ? starting : null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const booted = useRef(false)
  const hopping = useRef(false)

  /* Signing in is not a button: Cloudflare Access is the only party that can say who
     this is, and with its cookie present it returns before a page is drawn. Sending the
     browser there by itself is the whole of signing in — the `Continue` this used to
     wait for only asked the user to confirm what the browser already knew. */
  const hopToAccess = useCallback(() => {
    if (hopping.current) return
    hopping.current = true
    api.signIn()
  }, [])

  useEffect(() => {
    // Cloudflare Access owns the login. The only local question is whether the
    // engine still accepts our Access session, and the engine answers that
    // with /api/auth/whoami. A network failure keeps the cached profile so a
    // stopped engine does not look like a signed-out user.
    if (booted.current) return
    booted.current = true
    const cached = api.getSession()
    /* A profile and a bearer are all the console needs to start: Access is the exchange,
       not the door. Asking it again on every page load was the last thing that still
       depended on its cookie rather than on the token this tab already has. */
    if (cached.authenticated && api.hasEngineToken()) {
      setSession(cached)
      setPhase('home')
      return
    }
    api.refreshSession()
      .then(next => {
        setSession(next)
        if (next.authenticated) {
          setPhase('home')
          return
        }
        /* Came back from Access and still nobody: say that, rather than looping. */
        if (api.takeSignInReturn()) {
          setLoginError(SIGNIN_REFUSED)
          setPhase('login')
          return
        }
        /* A cached profile that no longer holds is the same situation as a first visit:
           the browser has to pass through Access before there is anything to read. */
        setPhase(cached.authenticated ? 'home' : 'boot')
        hopToAccess()
      })
      .catch(() => {
        const fallback = api.getSession()
        setSession(fallback)
        setPhase(fallback.authenticated ? 'home' : 'boot')
        if (!fallback.authenticated) hopToAccess()
      })
  }, [hopToAccess])

  useEffect(() => {
    /* A 401 from an engine is not by itself a signed-out browser: the identity endpoint
       is the authority. Asking it costs one round trip and stops a call the engine
       refuses from turning into a hop through Access on every render — which is a loop,
       because the hop comes back to the same refusal. */
    api.setUnauthorizedHandler(() => {
      void api.refreshSession().then(next => {
        if (next.authenticated) return
        setSession(null)
        if (api.takeSignInReturn()) {
          setLoginError(SIGNIN_REFUSED)
          setPhase('login')
          return
        }
        hopToAccess()
      })
    })
    return () => api.setUnauthorizedHandler(null)
  }, [hopToAccess])


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

  /* The button on the login page is only ever shown after Access has already let the
     browser through and no session came back, so it is a retry of the hop, not the way
     in. */
  const handleSignIn = () => {
    setLoginBusy(true)
    setLoginError(null)
    api.signIn()
  }

  const handleLogout = () => {
    setSession(null)
    setLogoutConfirmOpen(false)
    setPhase('login')
    // Cloudflare ends the Access session; the browser then comes back here.
    api.logout()
  }

  if (phase === 'boot') return <Boot label="Signing in…" />

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
