// Test helper: renders the real routes and AuthProvider inside a MemoryRouter, plus a probe
// that exposes the current location. Test files mock `client/src/api.ts` themselves (vi.mock).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, type InitialEntry } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../auth/AuthProvider';

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname + location.search + location.hash}
    </div>
  );
}

/** Current path (pathname + search + hash) and router state, read from the probe. */
export function currentLocation(): { path: string; state: unknown } {
  const probe = screen.getByTestId('location');
  return { path: probe.textContent ?? '', state: JSON.parse(probe.dataset.state ?? 'null') };
}

export function renderApp(initialEntries: InitialEntry[] = ['/']) {
  const user = userEvent.setup();
  const result = render(
    // Same router setting as main.tsx.
    <MemoryRouter initialEntries={initialEntries} useTransitions={false}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...result };
}
