import { useState } from 'react';
import { addMember, ApiError, removeMember, renameMember } from '../api/client.js';
import { useLogin } from '../state/LoginContext.js';
import { useConfirm } from './ConfirmDialog.js';
import { LabeledInput } from './LabeledInput.js';
import { MenButton } from './MenButton.js';

interface Props {
  /** Existing member name, or undefined for the trailing "add a member" row. */
  member?: string;
  memberNumber: number;
}

export function MemberRow({ member, memberNumber }: Props): React.JSX.Element {
  const { loginName, token, refreshMembers } = useLogin();
  const confirm = useConfirm();
  const [name, setName] = useState(member ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    if (!loginName || !token) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refreshMembers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(): Promise<void> {
    if (!loginName || !token || name.trim() === '') return;
    await withBusy(() => addMember(loginName, token, name.trim()));
    setName('');
  }

  async function handleRename(): Promise<void> {
    if (!loginName || !token || !member || name.trim() === '' || name.trim() === member) return;
    await withBusy(() => renameMember(loginName, token, member, name.trim()));
  }

  async function handleRemove(): Promise<void> {
    if (!loginName || !token || !member) return;
    const confirmed = await confirm({
      headline: 'Remove member',
      body: `Are you sure you want to remove ${member}?`,
    });
    if (!confirmed) return;
    await withBusy(() => removeMember(loginName, token, member));
  }

  return (
    <div className="edit-member">
      <LabeledInput
        id={`member-row-${memberNumber}`}
        label={`Name of member ${memberNumber}`}
        placeholder="Player name"
        maxLength={16}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      {member ? (
        <>
          <MenButton small onClick={handleRename} disabled={busy}>
            Rename
          </MenButton>
          <MenButton small onClick={handleRemove} disabled={busy}>
            Remove
          </MenButton>
        </>
      ) : (
        <MenButton small onClick={handleAdd} disabled={busy}>
          Add
        </MenButton>
      )}
      {error && <div className="validation-error">{error}</div>}
    </div>
  );
}
