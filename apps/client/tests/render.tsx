import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmDialogProvider } from '../src/components/ConfirmDialog.js';
import { GroupProvider } from '../src/state/GroupContext.js';

function AllProviders({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries ?? ['/']}>
      <GroupProvider>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </GroupProvider>
    </MemoryRouter>
  );
}

export function renderWithProviders(ui: ReactElement, initialEntries?: string[]) {
  return render(ui, { wrapper: (props) => <AllProviders {...props} initialEntries={initialEntries} /> });
}
