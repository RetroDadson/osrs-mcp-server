import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmDialogProvider } from '../src/components/ConfirmDialog.js';
import { LoginProvider } from '../src/state/LoginContext.js';
import { LayoutProvider } from '../src/state/LayoutContext.js';

function AllProviders({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries ?? ['/']}>
      <LoginProvider>
        <LayoutProvider>
          <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
        </LayoutProvider>
      </LoginProvider>
    </MemoryRouter>
  );
}

export function renderWithProviders(ui: ReactElement, initialEntries?: string[]) {
  return render(ui, { wrapper: (props) => <AllProviders {...props} initialEntries={initialEntries} /> });
}
