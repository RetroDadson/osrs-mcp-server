import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useLogin } from '../state/LoginContext.js';

export function LoginLayout(): React.JSX.Element {
  const { loginName, token, refreshMembers } = useLogin();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshMembers().finally(() => setLoading(false));
    // Only re-run when the login identity actually changes, not on every refreshMembers identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginName, token]);

  if (!loginName || !token) {
    return <Navigate to="/login" replace />;
  }

  return loading ? <p>Loading...</p> : <Outlet />;
}
