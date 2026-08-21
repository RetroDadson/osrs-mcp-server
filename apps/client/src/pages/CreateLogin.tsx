import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createLogin, getCaptchaConfig } from '../api/client.js';
import { Captcha } from '../components/Captcha.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useLogin } from '../state/LoginContext.js';
import { validateOsrsName } from '../utils/validation.js';

const OTHER_COUNT_OPTIONS = [1, 2, 3, 4];

export function CreateLogin(): React.JSX.Element {
  const navigate = useNavigate();
  const { setCredentials } = useLogin();

  const [playerName, setPlayerName] = useState('');
  const [showAddOthers, setShowAddOthers] = useState(false);
  const [customLoginName, setCustomLoginName] = useState('');
  const [otherCount, setOtherCount] = useState(1);
  const [otherFields, setOtherFields] = useState<{ id: string; name: string }[]>(() => [
    { id: crypto.randomUUID(), name: '' },
  ]);
  const [captchaConfig, setCaptchaConfig] = useState<{ enabled: boolean; sitekey: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const getCaptchaResponse = useRef<(() => string) | null>(null);

  useEffect(() => {
    getCaptchaConfig()
      .then(setCaptchaConfig)
      .catch(() => setCaptchaConfig({ enabled: false, sitekey: '' }));
  }, []);

  function handleOtherCountChange(count: number): void {
    setOtherCount(count);
    setOtherFields((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push({ id: crypto.randomUUID(), name: '' });
      return next;
    });
  }

  function handleOtherFieldChange(index: number, value: string): void {
    setOtherFields((prev) => prev.map((f, i) => (i === index ? { ...f, name: value } : f)));
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setServerError(null);

    const trimmedPlayerName = playerName.trim();
    if (validateOsrsName(trimmedPlayerName)) {
      setServerError('Enter a valid name.');
      return;
    }

    const others = showAddOthers ? otherFields.map((f) => f.name.trim()).filter((n) => n !== '') : [];
    if (others.some((n) => validateOsrsName(n))) {
      setServerError('Every member name must be valid.');
      return;
    }

    const loginName = showAddOthers && customLoginName.trim() !== '' ? customLoginName.trim() : trimmedPlayerName;
    if (validateOsrsName(loginName)) {
      setServerError('Enter a valid login name.');
      return;
    }

    let captchaResponse = '';
    if (captchaConfig?.enabled) {
      captchaResponse = getCaptchaResponse.current?.() ?? '';
      if (!captchaResponse) {
        setServerError('Complete the captcha.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await createLogin(loginName, [trimmedPlayerName, ...others], captchaResponse);
      setCredentials(result.login_name, result.token);
      navigate('/setup-instructions');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Failed to create login.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <form className="create-login panel" onSubmit={handleSubmit}>
        <h3>Get started</h3>

        <LabeledInput
          id="player-name"
          label="Your OSRS name"
          placeholder="Player name"
          maxLength={16}
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          validate={validateOsrsName}
          required
        />

        {!showAddOthers && (
          <button type="button" className="add-others-toggle" onClick={() => setShowAddOthers(true)}>
            + Add others to share this
          </button>
        )}

        {showAddOthers && (
          <>
            <LabeledInput
              id="login-name"
              label="Login name"
              placeholder={trimmedOrFallback(playerName, 'Login name')}
              maxLength={16}
              value={customLoginName}
              onChange={(e) => setCustomLoginName(e.target.value)}
              validate={(value) => (value.trim() === '' ? null : validateOsrsName(value))}
            />

            <div className="select-container">
              <label htmlFor="other-count">Number of other players</label>
              <select
                id="other-count"
                value={otherCount}
                onChange={(e) => handleOtherCountChange(Number(e.target.value))}
              >
                {OTHER_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>

            {otherFields.map((field, index) => (
              <LabeledInput
                key={field.id}
                id={`other-member-name-${index}`}
                label={`Name of person ${index + 2}`}
                placeholder="Player name"
                maxLength={16}
                value={field.name}
                onChange={(e) => handleOtherFieldChange(index, e.target.value)}
                validate={(value) => (value.trim() === '' ? null : validateOsrsName(value))}
              />
            ))}
          </>
        )}

        {captchaConfig?.enabled && (
          <Captcha sitekey={captchaConfig.sitekey} onWidgetReady={(fn) => (getCaptchaResponse.current = fn)} />
        )}

        {serverError && <div className="validation-error">{serverError}</div>}

        <MenButton type="submit" disabled={submitting}>
          Create login
        </MenButton>
      </form>
    </div>
  );
}

function trimmedOrFallback(value: string, fallback: string): string {
  return value.trim() === '' ? fallback : value.trim();
}
