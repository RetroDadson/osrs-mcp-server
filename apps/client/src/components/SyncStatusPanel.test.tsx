import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { storeLogin } from '../state/storage.js';
import { SyncStatusPanel } from './SyncStatusPanel.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getSyncStatus: vi.fn() };
});

function renderPanel() {
  storeLogin('mylogin', 'mytoken');
  return renderWithProviders(<SyncStatusPanel />);
}

describe('SyncStatusPanel', () => {
  it('shows a loading state before the check resolves', () => {
    vi.mocked(api.getSyncStatus).mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
  });

  it('shows the last-synced time once data has been received', async () => {
    vi.mocked(api.getSyncStatus).mockResolvedValue({ lastUpdated: '2026-01-01T12:00:00.000Z' });
    renderPanel();
    expect(await screen.findByText(/Last synced/)).toBeInTheDocument();
  });

  it('shows a never-synced message when no data has ever been received', async () => {
    vi.mocked(api.getSyncStatus).mockResolvedValue({ lastUpdated: undefined });
    renderPanel();
    expect(await screen.findByText(/No data yet/)).toBeInTheDocument();
  });

  it('shows an error message when the status check fails', async () => {
    vi.mocked(api.getSyncStatus).mockRejectedValue(new Error('network error'));
    renderPanel();
    expect(await screen.findByText(/Couldn.t check connection status/)).toBeInTheDocument();
  });

  it('ignores a response that resolves after the component has unmounted', async () => {
    let resolveStatus!: (value: { lastUpdated: string | undefined }) => void;
    vi.mocked(api.getSyncStatus).mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );

    const { unmount } = renderPanel();
    unmount();
    resolveStatus({ lastUpdated: undefined });

    // Flush the microtask queue so the (now-guarded) .then() callback actually runs - if the
    // cancelled check were missing, this would surface as a React unmounted-state-update warning.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('ignores a failure that arrives after the component has unmounted', async () => {
    let rejectStatus!: (error: Error) => void;
    vi.mocked(api.getSyncStatus).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectStatus = reject;
      }),
    );

    const { unmount } = renderPanel();
    unmount();
    rejectStatus(new Error('network error'));

    await new Promise((r) => setTimeout(r, 0));
  });
});
