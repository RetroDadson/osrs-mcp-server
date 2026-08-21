import { useState } from 'react';
import { ApiError, renameLogin } from '../api/client.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useLogin } from '../state/LoginContext.js';
import { useLayoutDirection } from '../state/LayoutContext.js';
import { validateOsrsName } from '../utils/validation.js';

export function Settings(): React.JSX.Element {
  const { loginName, token, setCredentials } = useLogin();
  const { direction: layout, setDirection: handleLayoutChange } = useLayoutDirection();
  const [newName, setNewName] = useState(loginName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRename(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmed = newName.trim();
    if (validateOsrsName(trimmed) || trimmed === loginName) return;

    setBusy(true);
    try {
      await renameLogin(token!, trimmed);
      setCredentials(trimmed, token!);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <div className="login-settings">
        <section className="login-settings__character panel">
          <h3>Character name</h3>
          <form onSubmit={handleRename} className="rename-character">
            <LabeledInput
              id="login-name-input"
              label="Your OSRS name"
              placeholder="Your OSRS name"
              maxLength={16}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              validate={validateOsrsName}
            />
            <MenButton type="submit" disabled={busy || newName.trim() === loginName}>
              Rename
            </MenButton>
          </form>
          {error && <div className="validation-error">{error}</div>}
        </section>

        <section className="login-settings__appearance panel">
          <h3>Appearance settings</h3>
          <fieldset>
            <legend>Dock panels</legend>
            <label>
              <input type="radio" name="layout" checked={layout === 'row'} onChange={() => handleLayoutChange('row')} />{' '}
              Left
            </label>
            <label>
              <input
                type="radio"
                name="layout"
                checked={layout === 'row-reverse'}
                onChange={() => handleLayoutChange('row-reverse')}
              />{' '}
              Right
            </label>
          </fieldset>
        </section>
      </div>
    </div>
  );
}
