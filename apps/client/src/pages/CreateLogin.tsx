import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createLogin, getCaptchaConfig } from '../api/client.js';
import { Captcha } from '../components/Captcha.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useLogin } from '../state/LoginContext.js';
import { validateOsrsName } from '../utils/validation.js';

export function CreateLogin(): React.JSX.Element {
  const navigate = useNavigate();
  const { setCredentials } = useLogin();

  const [playerName, setPlayerName] = useState('');
  const [captchaConfig, setCaptchaConfig] = useState<{ enabled: boolean; sitekey: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const getCaptchaResponse = useRef<(() => string) | null>(null);

  useEffect(() => {
    getCaptchaConfig()
      .then(setCaptchaConfig)
      .catch(() => setCaptchaConfig({ enabled: false, sitekey: '' }));
  }, []);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setServerError(null);

    const trimmedPlayerName = playerName.trim();
    if (validateOsrsName(trimmedPlayerName)) {
      setServerError('Enter a valid name.');
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
      const result = await createLogin(trimmedPlayerName, captchaResponse);
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
