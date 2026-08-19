import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ConfirmDialogProvider } from './components/ConfirmDialog.js';
import { CreateGroup } from './pages/CreateGroup.js';
import { GroupLayout } from './pages/GroupLayout.js';
import { GroupSettings } from './pages/GroupSettings.js';
import { Home } from './pages/Home.js';
import { Login } from './pages/Login.js';
import { Logout } from './pages/Logout.js';
import { SetupInstructions } from './pages/SetupInstructions.js';
import { GroupProvider } from './state/GroupContext.js';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/create-group', element: <CreateGroup /> },
  { path: '/setup-instructions', element: <SetupInstructions /> },
  { path: '/login', element: <Login /> },
  { path: '/logout', element: <Logout /> },
  {
    path: '/group',
    element: <GroupLayout />,
    children: [
      { index: true, element: <GroupSettings /> },
      { path: 'settings', element: <GroupSettings /> },
    ],
  },
  { path: '*', element: <Home /> },
]);

export function App(): React.JSX.Element {
  return (
    <GroupProvider>
      <ConfirmDialogProvider>
        <RouterProvider router={router} />
      </ConfirmDialogProvider>
    </GroupProvider>
  );
}
