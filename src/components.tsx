import { Loader2, ShieldCheck, Smartphone } from 'lucide-react'

// ---------------------------------------------------------------- boot

export function Boot({ label = 'Connecting to console…' }: { label?: string }) {
  return (
    <div className="boot">
      <div className="boot-mark"><Smartphone size={26} /></div>
      <div className="boot-spinner" />
      <p className="boot-label">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------- errors

export function ErrorBanner({ message }: { message: string }) {
  return <p className="error-banner">{message}</p>
}

// ---------------------------------------------------------------- login

export function LoginPage({
  onSignIn,
  busy,
  error,
}: {
  onSignIn: () => void
  busy: boolean
  error: string | null
}) {
  return (
    <main className="ax-login-page">
      <div className="ax-login-ambient" aria-hidden="true" />
      <header className="ax-login-header">
        <a className="ax-login-wordmark" href="/" aria-label="AIxodia">
          <svg className="ax-login-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <circle cx="20" cy="20" r="14.5" stroke="currentColor" strokeOpacity=".42" />
            <circle cx="20" cy="20" r="8.5" stroke="currentColor" strokeOpacity=".7" />
            <path d="M20 2.5v8M20 29.5v8M2.5 20h8M29.5 20h8M7.6 7.6l5.7 5.7m13.4 13.4 5.7 5.7m0-24.8-5.7 5.7m-13.4 13.4-5.7 5.7" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="20" cy="20" r="3.5" fill="currentColor" />
            <circle cx="20" cy="5.5" r="2" fill="#28c9f5" />
            <circle cx="34.5" cy="20" r="2" fill="#8b65ff" />
            <circle cx="8" cy="10" r="1.7" fill="#8b65ff" />
          </svg>
          <span>AI<span className="ax-login-wordmark-light">XODIA</span></span>
        </a>
      </header>

      <div className="ax-login-layout">
        <section className="ax-login-story" aria-labelledby="ax-login-headline">
          <div className="ax-orbit-scene" aria-hidden="true">
            <div className="ax-orbit-halo" />
            <div className="ax-orbit-ring ax-orbit-ring-one" />
            <div className="ax-orbit-ring ax-orbit-ring-two" />
            <div className="ax-orbit-ring ax-orbit-ring-three" />
            <svg className="ax-orbit-lines" viewBox="0 0 420 320" fill="none">
              <path d="M210 160 132 106 92 174 210 160 292 93 330 177 210 160 276 242 132 106" />
              <path d="M132 106 180 48 210 160 276 242 330 177" />
              <path d="M92 174 180 48 292 93 276 242" />
              <circle cx="132" cy="106" r="4" /><circle cx="92" cy="174" r="3" />
              <circle cx="292" cy="93" r="4" /><circle cx="330" cy="177" r="3" />
              <circle cx="276" cy="242" r="4" /><circle cx="180" cy="48" r="3" />
            </svg>
            <div className="ax-orbit-core"><span /><i /><b /></div>
          </div>
        </section>

        <section className="ax-login-panel" aria-labelledby="ax-login-title">
          <h2 id="ax-login-title">Sign in</h2>
          {error && <div className="ax-login-error"><ErrorBanner message={error} /></div>}

          <div className="ax-login-device">
            <p className="ax-login-note">
              Your session is verified by Cloudflare Access. Continuing opens the
              console with the account you are already signed in with.
            </p>
            <button className="ax-github-button" type="button" onClick={onSignIn} disabled={busy}>
              {busy ? <Loader2 size={19} className="spin" /> : <ShieldCheck size={19} />}
              <span>{busy ? 'Signing in…' : 'Continue'}</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
