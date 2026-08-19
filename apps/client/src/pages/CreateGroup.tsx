import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createGroup, getCaptchaConfig } from '../api/client.js';
import { Captcha } from '../components/Captcha.js';
import { LabeledInput } from '../components/LabeledInput.js';
import { MenButton } from '../components/MenButton.js';
import { useGroup } from '../state/GroupContext.js';
import { validateOsrsName } from '../utils/validation.js';

const MEMBER_COUNT_OPTIONS = [1, 2, 3, 4, 5];

export function CreateGroup(): React.JSX.Element {
  const navigate = useNavigate();
  const { setCredentials } = useGroup();

  const [groupName, setGroupName] = useState('');
  const [memberCount, setMemberCount] = useState(1);
  const [memberNames, setMemberNames] = useState<string[]>(['']);
  const [captchaConfig, setCaptchaConfig] = useState<{ enabled: boolean; sitekey: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const getCaptchaResponse = useRef<(() => string) | null>(null);

  useEffect(() => {
    getCaptchaConfig()
      .then(setCaptchaConfig)
      .catch(() => setCaptchaConfig({ enabled: false, sitekey: '' }));
  }, []);

  function handleMemberCountChange(count: number): void {
    setMemberCount(count);
    setMemberNames((prev) => {
      const next = prev.slice(0, count);
      while (next.length < count) next.push('');
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setServerError(null);

    if (validateOsrsName(groupName)) {
      setServerError('Enter a valid group name.');
      return;
    }
    const filledNames = memberNames.map((n) => n.trim()).filter((n) => n !== '');
    if (filledNames.some((n) => validateOsrsName(n))) {
      setServerError('Every member name must be valid.');
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
      const result = await createGroup(groupName.trim(), filledNames, captchaResponse);
      setCredentials(result.name, result.token);
      navigate('/setup-instructions');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Failed to create group.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <form className="create-group rsborder rsbackground" onSubmit={handleSubmit}>
        <h3>Create a group</h3>

        <LabeledInput
          id="group-name"
          label="Group name"
          placeholder="Group name"
          maxLength={16}
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          validate={validateOsrsName}
          required
        />

        <div className="select-container">
          <label htmlFor="member-count">Number of members</label>
          <select
            id="member-count"
            value={memberCount}
            onChange={(e) => handleMemberCountChange(Number(e.target.value))}
          >
            {MEMBER_COUNT_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>

        {memberNames.map((name, index) => (
          <LabeledInput
            key={index}
            id={`member-name-${index}`}
            label={`Name of member ${index + 1}`}
            placeholder="Player name"
            maxLength={16}
            value={name}
            onChange={(e) => {
              const value = e.target.value;
              setMemberNames((prev) => prev.map((n, i) => (i === index ? value : n)));
            }}
            validate={(value) => (value.trim() === '' ? null : validateOsrsName(value))}
          />
        ))}

        {captchaConfig?.enabled && (
          <Captcha sitekey={captchaConfig.sitekey} onWidgetReady={(fn) => (getCaptchaResponse.current = fn)} />
        )}

        {serverError && <div className="validation-error">{serverError}</div>}

        <MenButton type="submit" disabled={submitting}>
          Create group
        </MenButton>
      </form>
    </div>
  );
}
