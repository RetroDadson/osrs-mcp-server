import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amILoggedIn } from '../api/client.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useGroup } from '../state/GroupContext.js';

export function Login(): React.JSX.Element {
  const navigate = useNavigate();
  const { setCredentials } = useGroup();
  const [groupName, setGroupName] = useState('');
  const [groupToken, setGroupToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const ok = await amILoggedIn(groupName, groupToken);
      if (!ok) {
        setError('Group name or token is incorrect.');
        return;
      }
      setCredentials(groupName, groupToken);
      navigate('/group');
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
          id="login-group-name"
          label="Group name"
          placeholder="Group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          required
        />
        <LabeledInput
          id="login-group-token"
          label="Group token"
          placeholder="Group token"
          type="password"
          value={groupToken}
          onChange={(e) => setGroupToken(e.target.value)}
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
