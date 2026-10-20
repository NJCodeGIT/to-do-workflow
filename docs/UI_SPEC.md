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
| `/` (optional `?status=active\|completed`, S-007) | protected | `HomePage` (add-task form, status filter, task list) | `Your tasks - To-Do App` |
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
8. **View tasks** (S-007): home loads the list for the filter in the URL (All if none). Choosing
   Active / Completed / All pushes `/?status=active`, `/?status=completed` or `/` and loads that
   list from the API. Back/Forward step through earlier filter choices; reload keeps the filter.
   Visiting `/?status=active` while logged out redirects to `/login` with `from` including the
   query, so after login the same filter is shown (Routes: `redirectTarget` keeps `search`).
9. **Add a task** (S-008): on home, type a title (and optionally a description), press Enter in
   the title or activate `Add task`. Valid -> the task is created, the form is cleared, focus
   returns to the title (ready for the next task), `Task added.` is announced, and the current
   filter's list is refetched (the new task appears first under All and Active). Under
   Completed the filter is kept and the message says the new (active) task is not shown there.
   The URL never changes. Details: "Add task form (S-008)".
10. **Edit a task** (S-009): on home, activate a task's `Edit` button. The item turns into a
   form pre-filled with the title and description, focus in the title. Change the text and
   press Enter in the title or activate `Save`: the form closes, `Task updated.` is announced,
   the current filter's list is refetched (same order, same filter) and focus returns to that
   task's `Edit` button. `Cancel` or Escape closes the form without saving. Saving with no
   real change just closes the form. The URL never changes. Details: "Edit task (S-009)".
11. **Complete / reopen a task** (S-010): activate `Complete` on an Active task (or `Reopen` on a
   Completed one). The current filter's list is refetched: under All the task stays in place
   and its status text and button change; under Active a completed task (under Completed a
   reopened task) disappears. `Task completed.` / `Task reopened.` is announced (plus a note
   when the task left the view). Focus returns to the task's (relabelled) button, or to the
   pressed filter button if the task left the view. The URL never changes. Details:
   "Complete, reopen and delete (S-010)".
12. **Delete a task** (S-010): activate `Delete` on a task. The item's buttons are replaced by
   `Delete "<title>"? This cannot be undone.` with `Delete` and `Cancel`; focus is on Cancel.
   Cancel or Escape closes the prompt (nothing sent, focus back on the item's `Delete`).
   `Delete` deletes the task, the list is refetched without it, `Task deleted.` is announced,
   focus goes to the pressed filter button. Details: "Complete, reopen and delete (S-010)".

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

### Home: task list (`/`, S-007; add form S-008)
Ready, with tasks (filter All):
```
+--------------------------------------------------+
|  To-Do App      Signed in as ann@example.com     |  <header>
|                                    [ Log out ]   |
+--------------------------------------------------+
|                                                  |  <main>
|  Your tasks                                <h1>  |
|                                                  |
|  Add a task                                <h2>  |  <- S-008 add form (see below),
|  Title                                           |     shown in every list state
|  [                                          ]    |     and under every filter
|  Description (optional)                          |
|  [                                          ]    |  <textarea rows=3>
|  [                                          ]    |
|  [ Add task ]                                    |
|                                     role=status  |  <- add confirmation, always in DOM
|                                                  |
|  Show: [*All*] [ Active ] [ Completed ]          |  <- role=group, aria-pressed buttons
|                                                  |
|  3 tasks                            role=status  |  <- live region, always in the DOM
|                                                  |
|                                     role=status  |  <- edit confirmation (S-009), always in DOM
|                                     role=status  |  <- action confirmation (S-010), always in DOM
|                                                  |
|  - Buy milk                                      |  <ul>, newest first (API order)
|    Active                                        |  <- status as text
|    [ Complete ] [ Edit ] [ Delete ]              |  <- names "Complete Buy milk", "Edit Buy milk",
|                                                  |     "Delete Buy milk" (S-009, S-010)
|  - Write report                                  |
|    Two pages, include the Q3 numbers and the     |  <- description only when not null,
|    chart from last week. Wraps, never cut off.   |     full text, wrapped, newlines kept
|    Completed                                     |
|    [ Reopen ] [ Edit ] [ Delete ]                |  <- completed tasks are editable too
|  - Call Bob                                      |
|    Active                                        |
|    [ Complete ] [ Edit ] [ Delete ]              |
+--------------------------------------------------+
```
`[*All*]` = the pressed button (`aria-pressed="true"`, also visually distinct, e.g. bold +
border, not color alone).

Loading (first load, filter change, or Try again):
```
|  Your tasks                                <h1>  |
|  Show: [ All ] [*Active*] [ Completed ]          |
|  Loading tasks...                   role=status  |  <- no list, no empty text, no alert
```

Empty (zero tasks for this filter; not an error):
```
|  Show: [ All ] [ Active ] [*Completed*]          |
|  No completed tasks.                role=status  |  <- message depends on the filter
```

Error (any failure except 401):
```
|  Show: [*All*] [ Active ] [ Completed ]          |  <- still usable
|                                     role=status  |  <- present but empty
|  [!] Error: Could not load your tasks.           |  role=alert
|  [ Try again ]                                   |  <- outside the alert container
```
The email comes from the stored session `user` (never from the token). It is rendered as
text (React escaping); nothing is injected as HTML (#26). Header, `<h1>Your tasks</h1>` and the
document title are unchanged from S-004. In the loading, empty and error sketches above the
add form is omitted for brevity; it is always rendered above the filter. The edit
confirmation region (S-009) and the action confirmation region (S-010) are always rendered
after the list status region (empty in the sketches). Complete/reopen/delete: see "Complete,
reopen and delete states (S-010)".

### Add task form states (S-008)
Validation error (submit with an empty title and a 2001-character description):
```
|  Add a task                                <h2>  |
|  Title                                           |
|  [                                          ]    |  <- aria-invalid, focused
|  Enter a title.                                  |  <- id add-task-title-error
|  Description (optional)                          |
|  [ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx ]    |  <- aria-invalid
|  Description must be at most 2000 characters.    |  <- id add-task-description-error
|  [ Add task ]                                    |
|                                     role=status  |  <- empty (cleared by this submit)
```

Sending (button disabled, inputs stay editable):
```
|  Title                                           |
|  [ Buy milk                                 ]    |
|  Description (optional)                          |
|  [                                          ]    |
|  [ Adding... ]                        disabled   |
|                                     role=status  |  <- empty while sending
```

Success under All or Active (list refetches: `Loading tasks...` briefly, then the new list):
```
|  Title                                           |
|  [                                          ]    |  <- cleared, focused
|  Description (optional)                          |
|  [                                          ]    |  <- cleared
|  [ Add task ]                                    |
|  Task added.                        role=status  |
|                                                  |
|  Show: [*All*] [ Active ] [ Completed ]          |
|  4 tasks                            role=status  |  <- list region (separate)
|  - Buy milk                                      |  <- new task first (API order)
|    Active                                        |
```

Success under Completed (filter and URL unchanged; list refetched, still without the task):
```
|  [ Add task ]                                    |
|  Task added. It is active, so it is not shown    |
|  under Completed.                   role=status  |
|                                                  |
|  Show: [ All ] [ Active ] [*Completed*]          |
|  No completed tasks.                role=status  |
```

Server or network error (values kept, focus to title):
```
|  Add a task                                <h2>  |
|  [!] Error: Could not reach the server. Check    |
|      your connection and try again. role=alert   |  <- form-level, above the fields
|  Title                                           |
|  [ Buy milk                                 ]    |  <- value kept, focused
|  Description (optional)                          |
|  [ 2 litres                                 ]    |  <- value kept
|  [ Add task ]                                    |  <- re-enabled
|                                     role=status  |  <- empty
```

### Edit task states (S-009)
Editing "Write report" (the form replaces that item's content inside the same `<li>`; other
items keep their read-only view, their `Edit` buttons are disabled):
```
|  Show: [*All*] [ Active ] [ Completed ]          |
|  3 tasks                            role=status  |  <- list region, unchanged
|                                     role=status  |  <- edit confirmation, empty
|                                                  |
|  - Buy milk                                      |
|    Active                                        |
|    [ Complete ] [ Edit ] [ Delete ]  disabled    |  <- all item buttons (S-010)
|  - +------------------------------------------+  |  <form aria-label="Edit task">
|    | Title                                    |  |
|    | [ Write report|                        ] |  |  <- pre-filled, focused, caret at end
|    | Description (optional)                   |  |
|    | [ Two pages, include the Q3 numbers    ] |  |  <textarea rows=3>, pre-filled
|    | [ and the chart from last week.        ] |  |     (empty when description is null)
|    | [ Save ] [ Cancel ]                      |  |
|    +------------------------------------------+  |
|  - Call Bob                                      |
|    Active                                        |
|    [ Complete ] [ Edit ] [ Delete ]  disabled    |
```

Validation error (Save with an empty title):
```
|    | Title                                    |  |
|    | [                                      ] |  |  <- aria-invalid, focused
|    | Enter a title.                           |  |  <- id task-<id>-edit-title-error
|    | Description (optional)                   |  |
|    | [ Two pages, ...                       ] |  |
|    | [ Save ] [ Cancel ]                      |  |
```

Saving (inputs stay editable; the payload was fixed at submit):
```
|    | [ Saving... ] [ Cancel ]   both disabled |  |  <- Escape ignored too
```

Server or network error (form stays open, values kept, focus to title):
```
|    | [!] Error: Something went wrong. Please  |  |  role=alert, first child of the form
|    |     try again.                           |  |
|    | Title                                    |  |
|    | [ Write the report                     ] |  |  <- value kept, focused
|    | Description (optional)                   |  |
|    | [ Two pages, ...                       ] |  |
|    | [ Save ] [ Cancel ]                      |  |  <- re-enabled
```

After a successful save (list refetched: `Loading tasks...` briefly, then the new list):
```
|  3 tasks                            role=status  |
|  Task updated.                      role=status  |  <- edit confirmation region
|                                                  |
|  - Buy milk                                      |
|    Active                                        |
|    [ Edit ]                                      |  <- enabled again
|  - Write the report                              |  <- new values, same position
|    Two pages, ...                                |
|    Completed                                     |
|    [ Edit ]                                      |  <- focused (if focus was lost)
```

Task gone (save answered 404; form closed, list refetched without it):
```
|  2 tasks                            role=status  |
|                                     role=status  |  <- edit confirmation, empty
|  [!] Error: This task no longer exists.          |  role=alert, outside any item
|                                                  |
|  - Buy milk                                      |
|  ...                                             |
```

### Complete, reopen and delete states (S-010)
Completing "Buy milk" under All (request in flight; every item button disabled):
```
|  3 tasks                            role=status  |
|                                     role=status  |  <- edit confirmation
|                                     role=status  |  <- action confirmation, cleared on press
|  - Buy milk                                      |
|    Active                                        |
|    [ Completing... ] [ Edit ] [ Delete ]         |  <- all disabled
|  - Write report                                  |
|    Completed                                     |
|    [ Reopen ] [ Edit ] [ Delete ]    disabled    |
```

After success under All (list refetched: `Loading tasks...` briefly; same order):
```
|  3 tasks                            role=status  |
|  Task completed.                    role=status  |  <- action confirmation region
|  - Buy milk                                      |
|    Completed                                     |  <- new status text
|    [ Reopen ] [ Edit ] [ Delete ]                |  <- "Reopen" focused (if focus was lost)
```

After success under Active (the task left the view):
```
|  Show: [ All ] [*Active*] [ Completed ]          |  <- pressed button focused (if lost)
|  2 tasks                            role=status  |
|  Task completed. It is no longer shown under     |
|  Active.                            role=status  |
|  - Call Bob ...                                  |  <- "Buy milk" gone
```
Reopen mirrors this: `Reopening...` while in flight; `Task reopened.`, plus
` It is no longer shown under Completed.` under Completed.

Delete prompt open on "Buy milk" (no request yet; other items' buttons disabled):
```
|  - Buy milk                                      |
|    Active                                        |
|    +------------------------------------------+  |  role=group, name "Confirm delete"
|    | Delete "Buy milk"? This cannot be undone.|  |  <p id="task-<id>-delete-prompt">
|    | [ Delete ] [ Cancel ]                    |  |  <- Cancel focused on open
|    +------------------------------------------+  |
|  - Write report                                  |
|    Completed                                     |
|    [ Reopen ] [ Edit ] [ Delete ]    disabled    |
```

Deleting (in flight): `[ Deleting... ] [ Cancel ]`, both disabled, Escape ignored.

After a confirmed delete (list refetched without the task):
```
|  Show: [*All*] [ Active ] [ Completed ]          |  <- pressed button focused (if lost)
|  2 tasks                            role=status  |
|  Task deleted.                      role=status  |
|  - Write report ...                              |
```

Error on complete/reopen/delete (no reload; item unchanged; for delete the prompt stays open):
```
|  3 tasks                            role=status  |
|                                     role=status  |  <- action confirmation, empty
|  [!] Error: Could not reach the server. Check    |  role=alert, outside any item
|      your connection and try again.              |
|  - Buy milk                                      |
|    Active                                        |
|    [ Complete ] [ Edit ] [ Delete ]              |  <- re-enabled; "Complete" focused
```
404 (task deleted elsewhere): same as the S-009 "Task gone" sketch: prompt closed, list
refetched without it, `Error: This task no longer exists.`, pressed filter button focused (if lost).

## Task list behavior (S-007)
Decisions #45-#49.

### Filter and URL
- The filter is read from the URL on every render (the URL is the only source of truth; no
  copy in component state): `searchParams.getAll('status')`; exactly one value equal to
  `active` or `completed` -> that filter; anything else (no param, `all`, empty, unknown,
  wrong case such as `Active`, repeated) -> All. The fallback is never sent to the API as the
  raw value, and the URL is not rewritten (the All button is shown pressed).
- Choosing a filter: if it equals the current one, nothing happens (no navigation, no
  request). Otherwise navigate (push, not replace) to the same path with `status` removed and,
  for Active/Completed, set to that value; other query params are kept. All = no `status` param.
- Back/Forward change the URL, so the filter and list follow.

### Loading, results, empty, error
| State | Status region (`role="status"`) | Alert (`role="alert"`) | List |
|---|---|---|---|
| loading | `Loading tasks...` | none | none |
| ready, 0 tasks, All | `You have no tasks yet.` | none | none |
| ready, 0 tasks, Active | `No active tasks.` | none | none |
| ready, 0 tasks, Completed | `No completed tasks.` | none | none |
| ready, 1 task | `1 task` | none | `<ul>` |
| ready, n > 1 tasks | `n tasks` (e.g. `3 tasks`) | none | `<ul>` |
| error | empty | `Error: Could not load your tasks.` + `Try again` button after it | none |
| 401 | not shown: global handling (Flows 6) redirects to `/login`; the page stays in loading until unmounted | - | - |

- One request per filter change, per Try again, and on mount; no caching across filters, no
  polling. A response that arrives after the filter changed (or after Try again, or after
  unmount) is ignored. The previous filter's list is never shown under the new filter.
- One fixed error text for network failure, 5xx, 400, malformed response, or any other non-401
  error; server `message` text is never shown.
- Try again repeats the request for the current filter, shows loading, and moves focus to the
  pressed filter button (the Try again button disappears, so focus must not fall to `<body>`).
- Item: title (plain text), description when not `null` (plain text, full length, CSS
  `white-space: pre-wrap; overflow-wrap: anywhere` so newlines are kept and long words wrap),
  status text `Active` / `Completed`. No dates. Title element id `task-<id>-title` (seam for
  S-009/S-010 control labels). Order is exactly the API order.
- Logout unmounts the page; a different user logging in gets a fresh mount and a fresh request
  (no list is kept in memory between sessions).

## Add task form (S-008)
Decisions #50-#53. Component `AddTaskForm` (`client/src/tasks/AddTaskForm.tsx`), rendered by
`TasksView` as its first child (between `<h1>Your tasks</h1>` and the filter), in every list
state (loading, ready, empty, error) and under every filter. Pure rules and texts live in
`client/src/tasks/task-form.ts`. The data call is `createTask` in `client/src/api.ts`.

### Structure
- `<section aria-labelledby="add-task-heading">` with `<h2 id="add-task-heading">Add a task</h2>`,
  then the form-level alert (only when set), then
  `<form noValidate aria-labelledby="add-task-heading">` containing:
  - `<label htmlFor="add-task-title">Title</label>` + `<input id="add-task-title" type="text"
    name="title" autoComplete="off">`, then its error `<p id="add-task-title-error">` when set.
  - `<label htmlFor="add-task-description">Description (optional)</label>` + `<textarea
    id="add-task-description" name="description" rows={3}>`, then its error
    `<p id="add-task-description-error">` when set.
  - `<button type="submit">Add task</button>` (`Adding...` and `disabled` while sending).
- After the form, still inside the section: `<div role="status">` holding the confirmation,
  always rendered (empty when there is nothing to say). It is separate from the list's
  results region so the two never overwrite each other.
- No `required`, no `maxLength`, no `autoFocus` attributes. Over-long input is reported on
  submit, never silently cut (#51).

### Submit flow
1. `preventDefault`. If a request is in flight (ref flag), return: nothing is sent, nothing
   changes (the flag, not only `disabled`, stops a second Enter).
2. Clear the confirmation (so a repeated `Task added.` is announced again) and validate the
   current values (table below).
3. Invalid -> clear the form-level error, show the field errors, focus the first invalid field
   (title before description; errors rendered before focusing, as in the auth forms), send
   nothing.
4. Valid -> build the payload from the values at this moment: `title` = trimmed title;
   `description` = trimmed description, **key omitted** when the trimmed value is empty.
   Nothing else is sent. Set the in-flight flag, clear field and form-level errors, disable the
   button with label `Adding...`. Inputs stay editable; later typing does not change the
   payload already sent.
5. Success (`createTask` resolves) -> clear the flag, re-enable the button, empty both fields
   (also anything typed while sending), clear errors, set the confirmation (below), call
   `onAdded()` (TasksView passes `reload`), and focus the title input.
6. Failure -> clear the flag, re-enable the button, keep the current values, set the form-level
   error (table below) and focus the title input. Exception: a 401 sets no form error and moves
   no focus; the global handling (#30, Flows 6) clears the session and redirects to `/login`
   with the session-expired notice.

- Editing a field removes that field's error. The form-level error stays until the next submit.
- The confirmation stays until the next submit (valid or invalid); no timer.

### Client validation (mirrors `docs/API_SPEC.md` "Task validation rules", #32; UX only)
| Field | Rule (after JS `trim()`; length = JS string length) | Message |
|---|---|---|
| title | empty (incl. whitespace-only) | `Enter a title.` |
| title | more than 200 characters | `Title must be at most 200 characters.` |
| description | more than 2000 characters | `Description must be at most 2000 characters.` |

Exactly 200 / 2000 characters (after trim) are accepted. Both fields are checked on every
submit, so both errors can show at once; focus goes to the first invalid one.

### Confirmation text (set on success; uses the filter current when the response arrives)
| Filter | Text |
|---|---|
| All, Active | `Task added.` |
| Completed | `Task added. It is active, so it is not shown under Completed.` |

The text is fixed when it is set: a later filter change does not rewrite it (no extra
announcement on filter clicks). The filter and URL are never changed by adding.

### List refresh after success
- `onAdded()` = `useTasks().reload()` (#47): the current filter is refetched, so the list
  region shows `Loading tasks...` and hides the list until the response arrives, then shows the
  API order (new active task first under All and Active). No client-side insertion or sorting.
- A list response from before the add is dropped by the hook's `ignore` flag; two adds in a
  row end with the list from the last reload.
- A failed refetch shows the S-007 list error state (`Error: Could not load your tasks.` +
  Try again). The add is not reported as failed: the form is already cleared and
  `Task added.` stays.

### Server and network errors -> form-level message
| Result of `createTask` | Message (rendered `Error: <message>` in `role="alert"`) |
|---|---|
| 400 `VALIDATION_ERROR` with a non-empty message | the server's message, verbatim (e.g. `title is required`); fixed server strings that never echo input (#31) |
| network failure (`ApiError` status 0) | `Could not reach the server. Check your connection and try again.` |
| 5xx, any other status, malformed or empty 201 body, non-`ApiError` | `Something went wrong. Please try again.` |
| 401 | no form message (global handling) |

- The two fixed texts are the same constants as the auth forms (`NETWORK_MESSAGE`,
  `GENERIC_MESSAGE` in `client/src/auth/error-messages.ts`).
- Lost response: if the server created the task but the response never arrived (network error
  after the write), the form shows the network message and keeps the values; submitting again
  creates a second, identical task. Accepted (#53): no idempotency key without an API change.
  The user sees both after the next list load and can delete one (S-010).

## Edit task (S-009)
Decisions #54-#57. Inline edit inside the task's `<li>`; no modal, no route, no URL change.
Components in `client/src/tasks/`: `TaskItem` (read-only view + `Edit` button, or the form),
`EditTaskForm.tsx` (new: draft, validation, request), `TaskList` (passes edit props through),
`TasksView` (which task is open, confirmation, 404 alert, refetch and focus). Pure rules and
texts in `task-form.ts`; the data call is `updateTask` in `client/src/api.ts`.

S-010 generalizes three names used below without changing edit behavior (#59, #62):
`editing` becomes `openItem = {id, mode: 'edit' | 'delete', tasks}` (`editingId` = the id when
`mode === 'edit'`); the 404 alert `editAlert` becomes the shared `taskAlert`; the `Edit` button
map becomes one button map for `edit`, `toggle`, `delete` and `confirm` buttons. "Disabled while
another task is being edited" becomes "disabled while any item is open or a complete/reopen/delete
request is in flight".

### Who owns what
| State | Owner | Notes |
|---|---|---|
| which task is open (`editing: {id, tasks}`) | `TasksView` | valid only while `state.kind === 'ready'` and `state.tasks` is the same array it was opened on (#54) |
| draft title/description, field errors, form error, `submitting`, in-flight ref | `EditTaskForm` | lost when the form unmounts (accepted, #54) |
| `Task updated.` text, 404 alert text | `TasksView` | own regions, not the list region, not the add region |
| pending focus task id (ref) | `TasksView` | applied when the list is back (#56) |
| `Edit` button elements (`Map<id, HTMLButtonElement>` ref) | `TasksView` | filled by a callback ref on each item's `Edit` button |

`editingId` is derived during render:
`state.kind === 'ready' && editing !== null && editing.tasks === state.tasks ? editing.id : null`.
Every list replacement (reload after Add, Try again, filter change by click or Back/Forward,
reload after a save) produces a new array, so the form closes and the draft is dropped without
any extra handler or effect. On the first render where the list is not ready or not that
array, TasksView also sets `editing` to `null` (state adjusted during render, no effect), so the
close is final: a returning list never reopens a form by itself, even when `useTasks` hands back
the same earlier outcome after a quick filter round trip (e.g. Active -> All -> Active, or
Back/Forward, before the All request answers).

### Read-only item (`TaskItem`, not editing)
- As before (title `<p id="task-<id>-title">`, description when not `null`, status text), then
  `<button type="button" id="task-<id>-edit" aria-labelledby="task-<id>-edit task-<id>-title">Edit</button>`.
  Accessible name `Edit <title>` (visible text `Edit` is at the start of the name).
- `disabled` when another task is being edited (`editingId !== null`). Shown for Active and
  Completed tasks.
- Activating it (click, Enter, Space) calls `onEdit(task.id)`: TasksView sets
  `editing = {id, tasks: state.tasks}` and clears the edit confirmation and the 404 alert.

### Edit form (`EditTaskForm`, replaces the item's content inside the same `<li>`)
- Props: `task`, `onClose()`, `onSaved()`, `onNotFound()`.
- `<form noValidate aria-label="Edit task">`, then, in order: form-level alert (only when set,
  `<div role="alert"><p>Error: <message></p></div>`), `<label htmlFor="task-<id>-edit-title">Title</label>`
  + `<input id="task-<id>-edit-title" type="text" name="title" autoComplete="off">` + error
  `<p id="task-<id>-edit-title-error">` when set; `<label htmlFor="task-<id>-edit-description">Description (optional)</label>`
  + `<textarea id="task-<id>-edit-description" name="description" rows={3}>` + error
  `<p id="task-<id>-edit-description-error">` when set; `<button type="submit">Save</button>`
  (`Saving...` and `disabled` in flight); `<button type="button">Cancel</button>` (`disabled` in flight).
- Initial values: `task.title`; `task.description ?? ''`.
- On mount (effect): focus the title input and put the caret at the end
  (`setSelectionRange(len, len)`). No `autoFocus`, `required` or `maxLength` attributes.
- Field errors as in the add form: `aria-invalid="true"` + `aria-describedby="<id>-error"`;
  editing a field clears its own error; the form error stays until the next Save.

### Save flow
1. `preventDefault`. If the in-flight ref is set, return (no second request; Enter is caught too).
2. Validate the current values with the shared rules (S-008 table: `Enter a title.`,
   `Title must be at most 200 characters.`, `Description must be at most 2000 characters.`;
   200 / 2000 after trim accepted). Invalid -> clear the form error, show field errors (render
   before focusing, `flushSync`), focus the first invalid field, send nothing.
3. Build the patch with `editTaskPatch(task, title, description)` (below). `null` (nothing
   changed) -> call `onClose()`: form closes, no request, no message, focus to this item's `Edit`.
4. Otherwise set the in-flight ref, clear errors, set `submitting` (Save shows `Saving...`,
   Save and Cancel disabled), call `updateTask(task.id, patch)`. Inputs stay editable; the
   payload is not changed by later typing.
5. Response handling (only if the form is still mounted; see "Late responses"):
   - success -> clear the ref, call `onSaved()`. The returned task is not used (the list is refetched).
   - `ApiError` 404 -> clear the ref, call `onNotFound()`.
   - 401 -> clear the ref, `submitting = false`, nothing else (global handling, Flows 6).
   - anything else -> clear the ref, `submitting = false`, set the form error from
     `taskErrorMessage(error)` (table below), keep the values, focus the title input.

### Patch (`editTaskPatch` in `task-form.ts`, #55)
Compares trimmed draft values with the task as shown (exact string comparison after trim, so
a case-only change is a change, matching #39):
| Draft vs task | Sent |
|---|---|
| `title.trim() !== task.title` | `title: title.trim()` |
| `description.trim() !== (task.description ?? '')`, trimmed value not empty | `description: description.trim()` |
| same, trimmed value empty (task had text) | `description: null` |
| neither changed (incl. whitespace-only edits) | nothing: helper returns `null`, no request |

Never `status`, `id`, `userId` or timestamps. Never `{}` (decision #35).

### Close, cancel and keyboard
- `Cancel` (click/Enter/Space) and Escape pressed anywhere inside the form (`onKeyDown` on the
  `<form>`, key `Escape`, ignored when `event.nativeEvent.isComposing` or while in flight) call
  `onClose()`: discard the draft silently, no request, no message.
- `onClose()` in TasksView: `flushSync(() => setEditing(null))`, then focus the item's `Edit`
  button from the button map (it is enabled again because nothing is being edited).
- Enter in the title submits (native form submit). Enter in the description inserts a newline.
- Tab order: Title, Description, Save, Cancel. No `tabIndex` above 0.

### After success (`onSaved`, TasksView)
1. `setEditing(null)`, set the edit confirmation to `Task updated.` (cleared again only when the
   next `Edit` is opened, so a repeated save is announced again), clear the 404 alert.
2. `pendingFocusId.current = task id`, then `reload()` (#47): the list region shows
   `Loading tasks...`, then the API order. Filter and URL unchanged; the edited task stays in
   place because status and `createdAt` did not change.
3. An effect in TasksView on `[state]`: when `pendingFocusId.current !== null` and
   `state.kind !== 'loading'`, take the id, set the ref to `null`, and, **only if focus is lost**
   (`document.activeElement` is `null` or `document.body`), focus that task's `Edit` button if it
   is in the map, else the pressed filter button (`pressedRef`, #48). A user who moved focus
   elsewhere (e.g. into the Add form) during the refetch is not interrupted.
4. A failed refetch shows the S-007 list error (`Error: Could not load your tasks.` + Try again);
   `Task updated.` stays (the save did succeed); focus goes to the pressed filter button (step 3).

### Task gone (`onNotFound`, TasksView)
`setEditing(null)`, clear the confirmation, set the 404 alert to `This task no longer exists.`
(fixed text, rendered `Error: This task no longer exists.`), set the pending focus id, `reload()`.
The task is no longer in the refetched list, so focus falls back to the pressed filter button
(if lost). No retry is offered. The alert is cleared when the next `Edit` is opened.

### Errors -> form-level message (`taskErrorMessage`, shared with the add form, #57)
| Result of `updateTask` | Message (rendered `Error: <message>` in the form's `role="alert"`) |
|---|---|
| 400 `VALIDATION_ERROR` with a non-empty message | the server's message, verbatim |
| network failure (status 0) | `Could not reach the server. Check your connection and try again.` |
| 5xx, other status, malformed or empty 200 body, non-`ApiError` | `Something went wrong. Please try again.` |
| 404 | not a form message: "Task gone" above |
| 401 | none (global handling) |

PATCH is idempotent, so retrying after a lost response is safe (unlike add, #53).

### Interaction with the rest of the page
- Editing does not disable the Add form or the filter. A successful Add, a filter change
  (click or Back/Forward) or anything else that replaces the list closes the form and drops the
  draft (derived `editingId`). Try again only exists in the list error state, where no list (and
  so no form) is shown.
- Late responses: if the form unmounted while its request was in flight (the list was replaced),
  the result is ignored (a `mounted` ref in `EditTaskForm`): no message, no reload, no focus, so
  it can never close another task's form. The server may still have applied the change; the
  next list load shows it. Accepted (#57).
- Last write wins; no conflict detection (out of scope).
- Region order in TasksView: Add form section, filter, list status (`role="status"`), edit
  confirmation (`role="status"`, always rendered), action confirmation (`role="status"`, always
  rendered, S-010), task alert (`role="alert"`, only when set; edit 404 and S-010 errors),
  list error alert + Try again, list. `Task added.` and `Task updated.` live in separate regions
  and do not clear each other; both may be visible at once (each is still true).

## Complete, reopen and delete (S-010)
Decisions #58-#62. Client only: no API, schema or dependency change. Components in
`client/src/tasks/`: `TaskItem` (buttons, or the edit form, or the delete prompt), new
`DeleteTaskConfirm.tsx` (the prompt), `TaskList` (pass-through), `TasksView` (state, requests,
messages, focus). Pure rules and texts in new `task-actions.ts`. Data calls `updateTask(id, {status})`
and new `deleteTask(id)` in `client/src/api.ts`.

### Who owns what (all in `TasksView`)
| State | Kind | Notes |
|---|---|---|
| `openItem = {id, mode: 'edit' \| 'delete', tasks} \| null` | state | replaces `editing` (#54); derived `openId`/`mode` valid only while `state.kind === 'ready'` and `state.tasks === openItem.tasks`; cleared during render otherwise |
| `busy = {id, action: 'status' \| 'delete'} \| null` | state | drives `disabled` and in-flight labels; not tied to the list (#59) |
| `inFlight` | ref (boolean) | the double-submit guard, checked first by every handler |
| `shownTasks` | ref (`Task[] \| null`) | set in `useLayoutEffect([state])` to `state.tasks` when ready, else `null`; cleanup sets `null` (also on unmount) |
| `actionStatus` | state (string) | text of the action confirmation region |
| `taskAlert` | state (string \| null) | replaces `editAlert`; edit 404 and all S-010 errors |
| `pendingFocus = {id, button: 'edit' \| 'toggle' \| 'delete'} \| null` | ref | replaces `pendingFocusId` (#56) |
| button map `Map<"<id>:<kind>", HTMLButtonElement>` | ref | kinds `edit`, `toggle`, `delete`, `confirm`; filled by callback refs (replaces the `Edit` map) |

Derived during render: `openId` (id or null), `editingId = mode === 'edit' ? openId : null`,
`deletingPromptId = mode === 'delete' ? openId : null`, and per item
`actionsDisabled = busy !== null || openId !== null` (an open item shows the form or prompt
instead of its buttons, so this only affects the other items).

### Read-only item (`TaskItem`)
After the title, description and status text, a row of three native `<button type="button">`:
| Button | id | Visible text | Accessible name | `onClick` |
|---|---|---|---|---|
| toggle | `task-<id>-toggle` | `Complete` (Active) / `Reopen` (Completed); in flight `Completing...` / `Reopening...` | `aria-labelledby="task-<id>-toggle task-<id>-title"` -> `Complete Buy milk` | `onToggle()` |
| edit | `task-<id>-edit` | `Edit` | as S-009 -> `Edit Buy milk` | `onEdit()` |
| delete | `task-<id>-delete` | `Delete` | `aria-labelledby="task-<id>-delete task-<id>-title"` -> `Delete Buy milk` | `onDelete()` (opens the prompt) |

All three `disabled={actionsDisabled}`. Shown for Active and Completed tasks. Each gets the
callback ref for its kind. No checkbox, no strikethrough (#58, #49).

### Delete prompt (`DeleteTaskConfirm`, when `deletingPromptId === task.id`)
Replaces the button row (title, description and status text stay):
```
<div role="group" aria-label="Confirm delete" onKeyDown={...}>
  <p id="task-<id>-delete-prompt">Delete "<title>"? This cannot be undone.</p>
  <button type="button" id="task-<id>-delete-confirm" aria-describedby="task-<id>-delete-prompt">Delete</button>
  <button type="button" aria-describedby="task-<id>-delete-prompt">Cancel</button>
</div>
```
- Props: `task`, `deleting` (busy on this task with `delete`), `disabled` (`busy !== null`),
  `onConfirm()`, `onCancel()`, `confirmRef` (callback ref, kind `confirm`).
- On mount (effect): focus `Cancel`.
- While `deleting`: confirm shows `Deleting...`; both buttons `disabled`.
- Escape (`onKeyDown` on the group, key `Escape`, not `event.nativeEvent.isComposing`) calls
  `onCancel()`; TasksView ignores it while `inFlight` is set.
- The title is plain text (React escaping, #26).

### Handlers (TasksView)
`onToggle(task)`:
1. If `inFlight.current` or `state.kind !== 'ready'`, return (no request).
2. `startedOn = state.tasks`; `status = nextStatus(task.status)`; set `inFlight`; set
   `busy = {id, action: 'status'}`, `actionStatus = ''`, `taskAlert = null`.
3. `await updateTask(task.id, { status })`: body exactly `{"status":"completed"}` or `{"status":"active"}`.
4. Settled: clear `inFlight`, `setBusy(null)`. If `shownTasks.current !== startedOn`, stop (stale:
   no message, no reload, no focus).
5. Success: `actionStatus = statusChangedMessage(status, filter)`, `pendingFocus = {id, button: 'toggle'}`,
   `reload()`. The returned task is not used.
6. Failure: see "Errors".

`onDelete(id)` (opens the prompt): if `inFlight.current` or not ready, return; set
`openItem = {id, mode: 'delete', tasks: state.tasks}`, `taskAlert = null`. No request.

`onCancelDelete(id)`: if `inFlight.current`, return; `flushSync(() => setOpenItem(null))`, then
focus the button map's `<id>:delete`. No message.

`onConfirmDelete(task)`: like `onToggle` steps 1-4 with `busy = {id, action: 'delete'}` and
`await deleteTask(task.id)`. Success: `setOpenItem(null)`, `actionStatus = 'Task deleted.'`,
`pendingFocus = {id, button: 'delete'}` (the task is gone, so the effect falls back to the
pressed filter button), `reload()`.

`onEdit(id)` (S-009): also returns early when `inFlight.current`; sets
`openItem = {id, mode: 'edit', tasks}`, clears the edit confirmation and `taskAlert`.

Focus effect (#56, generalized): on `[state]`, when `pendingFocus.current !== null` and
`state.kind !== 'loading'`, take it, set the ref to `null`, and only if focus is lost
(`document.activeElement` is `null` or `body`) focus the map's `<id>:<button>` if present, else
the pressed filter button.

### Texts (`task-actions.ts`)
| When | Text |
|---|---|
| complete, filter All or Completed | `Task completed.` |
| complete, filter Active | `Task completed. It is no longer shown under Active.` |
| reopen, filter All or Active | `Task reopened.` |
| reopen, filter Completed | `Task reopened. It is no longer shown under Completed.` |
| delete | `Task deleted.` |
| prompt | `Delete "<title>"? This cannot be undone.` |

Helpers: `nextStatus(status)`, `toggleLabel(status, inFlight)`, `statusChangedMessage(newStatus, filter)`,
`TASK_DELETED_MESSAGE`, `deletePromptText(title)`, `actionErrorMessage(error)`. `TASK_GONE_MESSAGE`
stays in `task-form.ts` and is reused. The confirmation is cleared at the start of each toggle
and each delete confirm (so a repeat is announced again); it is not cleared by Add, Edit,
Cancel or filter changes, and add/edit/action confirmations do not clear each other.

### Errors (`actionErrorMessage`; shown `Error: <message>` in the TasksView `role="alert"`)
| Result | Handling |
|---|---|
| `ApiError` 404 | `setOpenItem(null)`, `taskAlert = 'This task no longer exists.'`, `pendingFocus = {id, button}`, `reload()`; focus ends on the pressed filter button (if lost). Same for delete (not treated as success, #62) |
| `ApiError` 401 | nothing (global handling, Flows 6); the prompt may stay open until the redirect |
| network (status 0) | `Could not reach the server. Check your connection and try again.` |
| any other status (incl. 400, 5xx), malformed 200, non-204 2xx on delete, non-`ApiError` | `Something went wrong. Please try again.` |

For the two message rows: no reload; `flushSync(() => { setBusy(null); setTaskAlert(message) })`,
then focus the button used: `<id>:toggle`, or `<id>:confirm` for delete (the prompt stays
open, so the user can retry or cancel). The server message is never shown and the id is
never echoed. The alert is cleared when the next Edit, toggle, Delete prompt or confirm starts.

### Interaction with the rest of the page
- One mutation at a time from the list: while any complete/reopen/delete request runs, every
  item button and the prompt buttons are disabled (even if the list was replaced meanwhile).
  The Add form and the filter stay usable. An open edit form or delete prompt disables the
  other items' buttons.
- Any list replacement (Add success, filter change by click or Back/Forward, reload after an
  edit) closes an open prompt (derived `openItem`, as for edit). Try again only exists in the
  error state, where no list is shown.
- Late responses: a result that arrives after the list was replaced or TasksView unmounted is
  ignored apart from clearing `busy`/`inFlight` (#59). The server may still have applied it; the
  next load shows it. A failed refetch after success shows the S-007 list error; the
  confirmation stays.
- Completed tasks stay editable; Edit works before and after Complete/Reopen.

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
  (`login-email`, `login-password`, `register-email`, `register-password`; home:
  `add-task-title`, `add-task-description`).
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
  `Creating account...` / `Adding...` / `Saving...`). Focus is restored to the email field (auth
  forms) or the title field (add task, edit task) when the request fails.
- **Keyboard**: native `<form>`, `<input>`, `<button type="submit">`, `<a>` (router `Link`) and a
  `<button type="button">` for logout, the task filter, Try again, `Edit`, `Cancel`, `Complete`/`Reopen`,
  `Delete` and the delete prompt's buttons; no click handlers on non-interactive elements.
  Tab order follows the visual order (notice/alert, email, password, submit, switch link).
  Enter in any field submits. No `tabIndex` values above 0. Visible focus outline is kept
  (never `outline: none` without a replacement).
- **Structure**: one `<h1>` per page (home also has the `<h2>Add a task</h2>`, S-008); `<header>` holds the app name (and, on home, the user email
  and logout button); page content is in `<main>`. `document.title` is set per route (table above).
- **Task filter** (S-007): `<div role="group" aria-labelledby="task-filter-label">` with a visible
  `<span id="task-filter-label">Show:</span>` and three native `<button type="button">` (`All`,
  `Active`, `Completed`) each with `aria-pressed="true|false"`. Buttons are never `disabled`
  (the pressed one stays focusable); Tab moves between them, Enter/Space activates. The pressed
  state is shown by more than color (e.g. bold text and a border).
- **Task results** (S-007): one `role="status"` element is always rendered (so screen readers
  have registered it before its text changes) and holds the loading, empty or count text.
  The error is a separate `role="alert"` container rendered only in the error state; the
  `Try again` button sits after it, not inside it. Status of each task is text, never color or
  an icon alone. No autofocus on load; focus is moved only by Try again (above), the edit
  flow (S-009, below) and the complete/reopen/delete flow (S-010, below).
- **Add task form** (S-008): ids `add-task-title`, `add-task-description` with visible labels
  (`Title`, `Description (optional)`); field errors as in the auth forms (`<id>-error`,
  `aria-invalid="true"`, `aria-describedby`, not `role="alert"`, announced by focusing the first
  invalid field). Form-level error: `role="alert"` inside the section, above the fields,
  rendered only when set. Confirmation: its own always-rendered `role="status"` (polite), after
  the form. The `<h2>Add a task</h2>` names both the section and the form
  (`aria-labelledby`). Keyboard: Tab order title, description, `Add task`, then the filter;
  Enter in the title submits; Enter in the description inserts a newline (no Ctrl+Enter);
  `Add task` by Enter/Space. Focus moves only after a submit: to the first invalid field, or to
  the title after success or a non-401 error. No autofocus on page load. Submitted text is
  rendered as plain text only (#26), so a title like `<b>x</b>` shows literally.
- **Edit task** (S-009): each item's `Edit` is a native `<button type="button">` named
  `Edit <title>` via `aria-labelledby="task-<id>-edit task-<id>-title"`; disabled while another
  task is open. The form is named `Edit task` (`aria-label`); per-task ids
  `task-<id>-edit-title`, `task-<id>-edit-description` (+ `-error`) are unique on the page;
  visible labels `Title`, `Description (optional)`; field errors as in the add form; form error
  `role="alert"` inside the form above the fields. Confirmation `Task updated.` in its own
  always-rendered `role="status"` in TasksView; `This task no longer exists.` in a
  `role="alert"` rendered only when set. Focus: Edit -> title (caret at end); Cancel, Escape
  and an unchanged Save -> that item's `Edit`; invalid Save -> first invalid field; error ->
  title; success -> that item's `Edit` once the list is back, 404 or failed refetch -> the
  pressed filter button (both only if focus was lost). Keyboard: Tab Title, Description, Save,
  Cancel; Enter in title saves, Enter in description is a newline, Escape cancels (not while
  saving). Edited text is plain text only (#26), in the inputs and in the list.
- **Complete, reopen, delete** (S-010): native `<button type="button">` named `Complete <title>`,
  `Reopen <title>`, `Delete <title>` (visible word first in the name, `aria-labelledby`);
  disabled while any item is open or a request is in flight. Delete prompt: `role="group"`
  named `Confirm delete`, prompt text `<p>` referenced by `aria-describedby` on both its
  buttons (`Delete`, `Cancel`). Confirmation in its own always-rendered `role="status"`; errors
  in the shared TasksView `role="alert"`. Focus: prompt open -> Cancel; Cancel/Escape -> the
  item's `Delete`; toggle success -> that task's toggle, or the pressed filter button if the
  task left the view; delete success, 404 -> pressed filter button (success/404 only if focus
  was lost); error -> the button used (toggle, or the prompt's `Delete`). Keyboard: Tab
  through toggle, Edit, Delete per item; Enter/Space activate; Escape cancels the prompt (not
  while deleting). Completed is shown as status text and the button word, never color alone.
  axe: no serious/critical violations with a Completed item and with the prompt open.
- **Contrast**: text and error text at least 4.5:1 against the background; focus indicator at
  least 3:1.
- No autofocus on page load.
