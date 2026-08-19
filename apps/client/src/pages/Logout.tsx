import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useLogin } from '../state/LoginContext.js';

export function Logout(): React.JSX.Element {
  const { logout } = useLogin();

  useEffect(() => {
    logout();
    // Runs once on mount - logging out is a pure side effect, not something to repeat on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Navigate to="/" replace />;
}
