import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { formErrorMessage, type FormError } from './error-messages';
import { useAuth } from './useAuth';
import { validateRegister, type FieldErrors } from './validation';

// docs/UI_SPEC.md "Register", "Form behavior", "Accessibility".
export default function RegisterPage() {
  const { register } = useAuth();
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
    document.title = 'Create account - To-Do App';
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmedEmail = email.trim();
    const errors = validateRegister(trimmedEmail, password);
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
      await register(trimmedEmail, password);
    } catch (error) {
      inFlight.current = false;
      flushSync(() => {
        setSubmitting(false);
        setFormError(formErrorMessage(error, 'register'));
      });
      emailRef.current?.focus();
      return;
    }
    // Success: PublicOnly redirects once the user is set; nothing to do here.
    inFlight.current = false;
    setSubmitting(false);
  }

  const emailErrorId = 'register-email-error';
  const passwordErrorId = 'register-password-error';
  const passwordHintId = 'register-password-hint';

  return (
    <>
      <header>
        <p>To-Do App</p>
      </header>
      <main>
        <h1>Create account</h1>
        {formError && (
          <div role="alert">
            <p>
              Error: {formError.message}
              {formError.loginLink && (
                <>
                  {' '}
                  <Link to="/login" state={location.state}>
                    Log in instead?
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
        <form noValidate onSubmit={handleSubmit}>
          <div>
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
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
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              ref={passwordRef}
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password ? `${passwordHintId} ${passwordErrorId}` : passwordHintId
              }
            />
            <p id={passwordHintId}>At least 8 characters.</p>
            {fieldErrors.password && <p id={passwordErrorId}>{fieldErrors.password}</p>}
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p>
          Already have an account?{' '}
          <Link to="/login" state={location.state}>
            Log in
          </Link>
        </p>
      </main>
    </>
  );
}
