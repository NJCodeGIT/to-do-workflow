import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './HomePage';
import LoginPage from './auth/LoginPage';
import { PublicOnly } from './auth/PublicOnly';
import RegisterPage from './auth/RegisterPage';
import { RequireAuth } from './auth/RequireAuth';

// Routes only (docs/UI_SPEC.md "Routes"). Router and AuthProvider are wired in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
