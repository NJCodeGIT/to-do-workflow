# UI Spec

Screens, flows, states, and accessibility rules for the SPA (`client/`). Styling is
minimal: usable and accessible, no design system. Decisions referenced as `#n` are rows
in `docs/DECISIONS.md`.

## Routes (S-004)
Router: `react-router-dom`, declarative mode (`BrowserRouter` in `main.tsx`, `<Routes>` in
`App.tsx`; tests use `MemoryRouter`). Both routers are created with `useTransitions={false}`
(see decision #28).

| Path | Access | Renders | Document title |
|---|---|---|---|
| `/login` | public only | `LoginPage` | `Log in - To-Do App` |
| `/register` | public only | `RegisterPage` | `Create account - To-Do App` |
| `/` | protected | `HomePage` (placeholder until the task stories) | `Your tasks - To-Do App` |
| `*` (anything else) | - | `<Navigate to="/" replace />` (then the guard applies) | - |

- **Protected** (`RequireAuth`): no user -> `<Navigate to="/login" replace state={{ from: location }} />`.
  With a user -> renders the page.
- **Public only** (`PublicOnly`): a user is present -> `<Navigate to={redirectTarget(location.state)} replace />`;
  otherwise renders the page.
- **Redirect back**: `redirectTarget(state)` returns `from.pathname + from.search + from.hash`
  when `state.from.pathname` is a string that starts with `/`, does not start with `//`, and is
  not `/\` (a backslash counts as `/` in URL parsing), and is not `/login` or `/register`;
  otherwise `/`. Login and register pages never call `navigate`
  after success: setting the user makes `PublicOnly` redirect (one redirect path, no race).
- The "Create an account" / "Log in" links between the two pages pass the current
  `location.state` on, so `from` survives switching forms.
- All redirects use `replace`, so Back never returns to a login form or a guarded URL loop.

## Flows
1. **Visitor opens a protected URL** (`/` or a future `/tasks/...`): redirected to `/login`
   (URL changes, `from` kept). After a successful login or register: back to that URL.
2. **Visitor opens `/login` directly**: logs in -> `/`.
3. **Register**: valid submit -> account created and logged in -> `from` target or `/`.
4. **Logged-in user opens `/login` or `/register`**: redirected to `/` (no form flashes).
5. **Logout** (button on home): session cleared, navigates to `/login` (replace, no `from`).
   Back/forward to `/` redirects to `/login` again.
6. **Session expires / token rejected**: any authenticated API call that gets 401 clears the
   session; the guard redirects to `/login` with `from` set to the current page, and the login
   page shows the "session expired" notice. After login: back to that page. A 401 for a request
   sent with an older token (the user logged out and in again while it was in flight) is
   ignored: no logout, no notice.
7. **Reload**: the session is read synchronously from storage on start, so a logged-in user
   sees home immediately (no loading state, no login flash). A token that has expired is not
   detected until the first authenticated call returns 401 (no client-side JWT decoding, #29).

## Wireframes

### Login (`/login`)
```
+--------------------------------------------------+
|  To-Do App                                       |
+--------------------------------------------------+
|                                                  |
|  Log in                                    <h1>  |
|                                                  |
|  [i] Your session has expired. Please log in     |  <- only after a forced logout
|      again.                         role=status  |     (sessionExpired)
|                                                  |
|  [!] Invalid email or password.      role=alert  |  <- form-level error, only when set
|                                                  |
|  Email                                           |
|  [ ann@example.com                          ]    |
|  ! Enter a valid email address.                  |  <- field error, only when set
|                                                  |
|  Password                                        |
|  [ ************                             ]    |
|                                                  |
|  [ Log in ]        (while sending: "Logging in...", disabled)
|                                                  |
|  No account yet? Create an account               |  <- link to /register
+--------------------------------------------------+
```

### Register (`/register`)
```
+--------------------------------------------------+
|  To-Do App                                       |
+--------------------------------------------------+
|                                                  |
|  Create account                            <h1>  |
|                                                  |
|  [!] This email is already registered.           |
|      Log in instead?               role=alert    |  <- "Log in" is a link to /login
|                                                  |
|  Email                                           |
|  [ ann@example.com                          ]    |
|                                                  |
|  Password                                        |
|  [ ************                             ]    |
|  At least 8 characters.                          |  <- hint, always shown
|  ! Password must be at least 8 characters.       |  <- field error, only when set
|                                                  |
|  [ Create account ]  (while sending: "Creating account...", disabled)
|                                                  |
|  Already have an account? Log in                 |  <- link to /login
+--------------------------------------------------+
```
No confirm-password field, show-password toggle, strength meter, or forgot-password link
(out of scope for S-004).

### Home placeholder (`/`)
```
+--------------------------------------------------+
|  To-Do App      Signed in as ann@example.com     |  <header>
|                                    [ Log out ]   |
+--------------------------------------------------+
|                                                  |  <main>
|  Your tasks                                <h1>  |
|                                                  |
|  Task list coming soon.                          |
|                                                  |
+--------------------------------------------------+
```
The email comes from the stored session `user` (never from the token). It is rendered as
text (React escaping); nothing is injected as HTML (#26).

## Form behavior (login and register)
- `<form noValidate>`: the browser's built-in validation bubbles are off so our messages are
  the only ones (consistent text, consistent announcement). Inputs still use `type="email"` /
  `type="password"` for the right keyboard and password managers.
- Validation runs **on submit only**. A field's error is removed as soon as that field is
  edited. The form-level error is removed on the next submit.
- On submit: trim the email (the trimmed value is validated and sent; the server lowercases).
  The password is never trimmed. Invalid -> show field errors, focus the first invalid field,
  send nothing.
- Valid -> clear the form-level error, disable the submit button and change its label, send the
  request. Inputs stay editable. A second submit (Enter or click) while a request is in flight
  does nothing (the handler also checks the in-flight flag, not only the `disabled` attribute).
- On error: re-enable the button, keep both field values, show the form-level error, move focus
  to the email field.
- On success: nothing to do in the page; the guard redirects (see Routes).

### Client validation (mirrors `server/src/schemas.ts`; UX only, the server decides)
Checks run in this order per field; the first failing one is shown.

| Field | Form | Rule | Message |
|---|---|---|---|
| email | both | empty after trim | `Enter your email address.` |
| email | both | more than 254 characters after trim | `Email must be at most 254 characters.` |
| email | both | fails `EMAIL_PATTERN` | `Enter a valid email address.` |
| password | login | empty | `Enter your password.` |
| password | login | more than 128 characters | `Password must be at most 128 characters.` |
| password | register | empty | `Enter a password.` |
| password | register | fewer than 8 characters | `Password must be at least 8 characters.` |
| password | register | more than 128 characters | `Password must be at most 128 characters.` |

- Lengths are JS string length (UTF-16 code units), same as the server.
- `EMAIL_PATTERN` is a copy of zod 4's default `z.email()` pattern (`z.regexes.email`), which is
  what the server uses. Copy it from the installed `zod` package (do not add `zod` to the
  client) and note the source in a comment. As of zod 4.6.7 (`client/src/auth/validation.ts`) it is:
  `/^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/`.
  If the two ever drift, the server's 400 is still shown (below), so drift is a UX issue only.
- Login has no 8-character minimum (decision #19: login must not reveal the policy).

### Server and network errors -> form-level message
| Result | Login message | Register message |
|---|---|---|
| 401 `UNAUTHORIZED` | `Invalid email or password.` | generic (not expected) |
| 409 `EMAIL_TAKEN` | generic (not expected) | `This email is already registered.` + link `Log in instead?` |
| 400 `VALIDATION_ERROR` | the server's `message`, verbatim | the server's `message`, verbatim |
| network failure (no response) | `Could not reach the server. Check your connection and try again.` | same |
| 5xx, any other status, or a non-JSON / malformed response | `Something went wrong. Please try again.` | same |

- `formErrorMessage(error, form)` (`error-messages.ts`) returns `{ message, loginLink }`;
  `loginLink` is true only for the register 409, where the page adds the `Log in instead?` link.
- The alert is rendered as `Error: <message>` so the error does not rely on color or the
  icon alone (the wireframes' `[!]` stands for this prefix).
- The 401 text is fixed in the client; it never says which field was wrong.
- 400 messages are fixed server strings (they never echo user input), so showing them is safe.
  They are shown form-level, not mapped to a field.
- Login and register 401/409 never trigger the global session-expired handling (#30).

## Accessibility
- **Labels**: every input has a visible `<label htmlFor>`; ids are unique per page
  (`login-email`, `login-password`, `register-email`, `register-password`).
  `autoComplete`: `email`; login password `current-password`; register password `new-password`.
- **Field errors**: an element with id `<input-id>-error`, rendered only when set; the input gets
  `aria-invalid="true"` and `aria-describedby` listing the error id (and, on register password,
  the hint id `register-password-hint` first). Field errors are announced by focusing the first
  invalid field (its description is read). They are not `role="alert"` (several at once would be noisy).
- **Form-level error**: one container with `role="alert"`, rendered only when there is a message,
  placed above the fields. Text conveys the problem; color is not the only cue (an icon or
  "Error:" prefix is optional).
- **Session-expired notice**: `role="status"` (polite), on the login page only.
- **Submit in flight**: the button has `disabled` and a changed label (`Logging in...` /
  `Creating account...`). Focus is restored to the email field when the request fails.
- **Keyboard**: native `<form>`, `<input>`, `<button type="submit">`, `<a>` (router `Link`) and a
  `<button type="button">` for logout only; no click handlers on non-interactive elements.
  Tab order follows the visual order (notice/alert, email, password, submit, switch link).
  Enter in any field submits. No `tabIndex` values above 0. Visible focus outline is kept
  (never `outline: none` without a replacement).
- **Structure**: one `<h1>` per page; `<header>` holds the app name (and, on home, the user email
  and logout button); page content is in `<main>`. `document.title` is set per route (table above).
- **Contrast**: text and error text at least 4.5:1 against the background; focus indicator at
  least 3:1.
- No autofocus on page load.
