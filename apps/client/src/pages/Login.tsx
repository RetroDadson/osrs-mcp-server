import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amILoggedIn } from '../api/client.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useLogin } from '../state/LoginContext.js';

export function Login(): React.JSX.Element {
  const navigate = useNavigate();
  const { setCredentials } = useLogin();
  const [loginName, setLoginName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const ok = await amILoggedIn(loginName, token);
      if (!ok) {
        setError('Name or token is incorrect.');
        return;
      }
      setCredentials(loginName, token);
      navigate('/manage');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <form className="login-page rsborder rsbackground" onSubmit={handleSubmit}>
        <h3>Login</h3>
        <LabeledInput
          id="login-name-input"
          label="Login name"
          placeholder="Login name"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          required
        />
        <LabeledInput
          id="login-token-input"
          label="Token"
          placeholder="Token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        {error && <div className="validation-error">{error}</div>}
        <MenButton type="submit" disabled={submitting}>
          Login
        </MenButton>
      </form>
    </div>
  );
}
