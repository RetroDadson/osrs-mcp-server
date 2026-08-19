import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useGroup } from '../state/GroupContext.js';

export function Logout(): React.JSX.Element {
  const { logout } = useGroup();

  useEffect(() => {
    logout();
    // Runs once on mount - logging out is a pure side effect, not something to repeat on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Navigate to="/" replace />;
}
