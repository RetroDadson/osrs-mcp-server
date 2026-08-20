import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { amILoggedIn } from '../api/client.js';
import { useLogin } from '../state/LoginContext.js';

export function LoginLayout(): React.JSX.Element {
  const { loginName, token, setCredentials, logout } = useLogin();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(true);

  useEffect(() => {
    if (!token) return;
    amILoggedIn(token)
      .then((resolvedName) => {
        if (!resolvedName) {
          logout();
          setValid(false);
          return;
        }
        if (resolvedName !== loginName) {
          setCredentials(resolvedName, token);
        }
      })
      .finally(() => setLoading(false));
    // Only re-run when the login identity actually changes, not on every setCredentials/logout identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginName, token]);

  if (!loginName || !token || !valid) {
    return <Navigate to="/login" replace />;
  }

  return loading ? <p>Loading...</p> : <Outlet />;
}
