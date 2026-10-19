import { useEffect, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { createTask, type TaskFilter } from '../api';
import {
  addTaskErrorMessage,
  addedMessage,
  newTaskPayload,
  validateNewTask,
  type TaskFieldErrors,
} from './task-form';

type Props = { filter: TaskFilter; onAdded: () => void };

// Add-task form (S-008, docs/UI_SPEC.md "Add task form (S-008)", decisions #50-#53).
export default function AddTaskForm({ filter, onAdded }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const inFlight = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // The confirmation uses the filter current when the response arrives (#52).
  const filterRef = useRef(filter);

  useEffect(() => {
    filterRef.current = filter;
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The flag, not only `disabled`, stops a second submit (e.g. Enter) while sending (#50).
    if (inFlight.current) return;

    const errors = validateNewTask(title, description);
    if (errors.title || errors.description) {
      // Render the errors (and aria-describedby) before focusing so the description is read.
      flushSync(() => {
        setConfirmation('');
        setFormError(null);
        setFieldErrors(errors);
      });
      (errors.title ? titleRef : descriptionRef).current?.focus();
      return;
    }

    const payload = newTaskPayload(title, description);
    inFlight.current = true;
    // Commit the cleared confirmation before the request, so a repeated text is announced again.
    flushSync(() => {
      setConfirmation('');
      setFormError(null);
      setFieldErrors({});
      setSubmitting(true);
    });

    try {
      await createTask(payload);
    } catch (error) {
      inFlight.current = false;
      const message = addTaskErrorMessage(error);
      if (message === null) {
        // 401: the global handling (#30) clears the session and redirects; no message, no focus.
        setSubmitting(false);
        return;
      }
      flushSync(() => {
        setSubmitting(false);
        setFormError(message);
      });
      titleRef.current?.focus();
      return;
    }

    inFlight.current = false;
    // Success clears both fields, including text typed while sending (#50).
    flushSync(() => {
      setTitle('');
      setDescription('');
      setFieldErrors({});
      setFormError(null);
      setSubmitting(false);
      setConfirmation(addedMessage(filterRef.current));
    });
    onAdded();
    titleRef.current?.focus();
  }

  const titleErrorId = 'add-task-title-error';
  const descriptionErrorId = 'add-task-description-error';

  return (
    <section aria-labelledby="add-task-heading">
      <h2 id="add-task-heading">Add a task</h2>
      {formError !== null && (
        <div role="alert">
          <p>Error: {formError}</p>
        </div>
      )}
      <form noValidate aria-labelledby="add-task-heading" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="add-task-title">Title</label>
          <input
            id="add-task-title"
            ref={titleRef}
            type="text"
            name="title"
            autoComplete="off"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setFieldErrors((prev) => ({ ...prev, title: undefined }));
            }}
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? titleErrorId : undefined}
          />
          {fieldErrors.title && <p id={titleErrorId}>{fieldErrors.title}</p>}
        </div>
        <div>
          <label htmlFor="add-task-description">Description (optional)</label>
          <textarea
            id="add-task-description"
            ref={descriptionRef}
            name="description"
            rows={3}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setFieldErrors((prev) => ({ ...prev, description: undefined }));
            }}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? descriptionErrorId : undefined}
          />
          {fieldErrors.description && <p id={descriptionErrorId}>{fieldErrors.description}</p>}
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add task'}
        </button>
      </form>
      <div role="status">{confirmation}</div>
    </section>
  );
}
