import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { formErrorMessage, type FormError } from './error-messages';
import { useAuth } from './useAuth';
import { validateLogin, type FieldErrors } from './validation';

// docs/UI_SPEC.md "Login", "Form behavior", "Accessibility".
export default function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Log in - To-Do App';
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmedEmail = email.trim();
    const errors = validateLogin(trimmedEmail, password);
    if (errors.email || errors.password) {
      // Render the errors (and aria-describedby) before focusing so the description is read.
      flushSync(() => {
        setFormError(null);
        setFieldErrors(errors);
      });
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    inFlight.current = true;
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } catch (error) {
      inFlight.current = false;
      flushSync(() => {
        setSubmitting(false);
        setFormError(formErrorMessage(error, 'login'));
      });
      emailRef.current?.focus();
      return;
    }
    // Success: PublicOnly redirects once the user is set; nothing to do here.
    inFlight.current = false;
    setSubmitting(false);
  }

  const emailErrorId = 'login-email-error';
  const passwordErrorId = 'login-password-error';

  return (
    <>
      <header>
        <p>To-Do App</p>
      </header>
      <main>
        <h1>Log in</h1>
        {sessionExpired && <p role="status">Your session has expired. Please log in again.</p>}
        {formError && (
          <div role="alert">
            <p>Error: {formError.message}</p>
          </div>
        )}
        <form noValidate onSubmit={handleSubmit}>
          <div>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
            />
            {fieldErrors.email && <p id={emailErrorId}>{fieldErrors.email}</p>}
          </div>
          <div>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
            />
            {fieldErrors.password && <p id={passwordErrorId}>{fieldErrors.password}</p>}
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p>
          No account yet?{' '}
          <Link to="/register" state={location.state}>
            Create an account
          </Link>
        </p>
      </main>
    </>
  );
}
