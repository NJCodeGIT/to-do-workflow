import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { ApiError, updateTask, type Task } from '../api';
import {
  editTaskPatch,
  taskErrorMessage,
  validateTaskFields,
  type TaskFieldErrors,
} from './task-form';

type Props = {
  task: Task;
  /** Cancel, Escape, or a Save with nothing changed: no request, no message. */
  onClose: () => void;
  onSaved: () => void;
  /** The save answered 404: the task is gone. */
  onNotFound: () => void;
};

// Inline edit form (S-009, docs/UI_SPEC.md "Edit task (S-009)", decisions #54-#57). Owns the
// draft; TasksView owns which task is open, the confirmation, the 404 alert and the refetch.
export default function EditTaskForm({ task, onClose, onSaved, onNotFound }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<TaskFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  // A result that arrives after the form unmounted (list replaced) is ignored (#57).
  const mounted = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mounted.current = true;
    const input = titleRef.current;
    if (input) {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The flag, not only `disabled`, stops a second submit (e.g. Enter) while saving.
    if (inFlight.current) return;

    const errors = validateTaskFields(title, description);
    if (errors.title || errors.description) {
      // Render the errors (and aria-describedby) before focusing so the description is read.
      flushSync(() => {
        setFormError(null);
        setFieldErrors(errors);
      });
      (errors.title ? titleRef : descriptionRef).current?.focus();
      return;
    }

    const patch = editTaskPatch(task, title, description);
    if (patch === null) {
      onClose();
      return;
    }

    inFlight.current = true;
    flushSync(() => {
      setFormError(null);
      setFieldErrors({});
      setSubmitting(true);
    });

    try {
      await updateTask(task.id, patch);
    } catch (error) {
      if (!mounted.current) return;
      inFlight.current = false;
      if (error instanceof ApiError && error.status === 404) {
        onNotFound();
        return;
      }
      const message = taskErrorMessage(error);
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

    if (!mounted.current) return;
    inFlight.current = false;
    // The returned task is not used: TasksView refetches the list (#56).
    onSaved();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || inFlight.current) return;
    event.preventDefault();
    onClose();
  }

  const titleId = `task-${task.id}-edit-title`;
  const descriptionId = `task-${task.id}-edit-description`;
  const titleErrorId = `${titleId}-error`;
  const descriptionErrorId = `${descriptionId}-error`;

  return (
    <form noValidate aria-label="Edit task" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      {formError !== null && (
        <div role="alert">
          <p>Error: {formError}</p>
        </div>
      )}
      <div>
        <label htmlFor={titleId}>Title</label>
        <input
          id={titleId}
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
        <label htmlFor={descriptionId}>Description (optional)</label>
        <textarea
          id={descriptionId}
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
        {submitting ? 'Saving...' : 'Save'}
      </button>{' '}
      <button type="button" onClick={onClose} disabled={submitting}>
        Cancel
      </button>
    </form>
  );
}
