import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from './components/AppShell.js';
import { CreateLogin } from './pages/CreateLogin.js';
import { LoginLayout } from './pages/LoginLayout.js';
import { Settings } from './pages/Settings.js';
import { Home } from './pages/Home.js';
import { Login } from './pages/Login.js';
import { Logout } from './pages/Logout.js';
import { SetupInstructions } from './pages/SetupInstructions.js';
import { LoginProvider } from './state/LoginContext.js';
import { LayoutProvider } from './state/LayoutContext.js';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/create-login', element: <CreateLogin /> },
      { path: '/setup-instructions', element: <SetupInstructions /> },
      { path: '/login', element: <Login /> },
      { path: '/logout', element: <Logout /> },
      {
        path: '/manage',
        element: <LoginLayout />,
        children: [
          { index: true, element: <Settings /> },
          { path: 'settings', element: <Settings /> },
        ],
      },
      { path: '*', element: <Home /> },
    ],
  },
]);

export function App(): React.JSX.Element {
  return (
    <LoginProvider>
      <LayoutProvider>
        <RouterProvider router={router} />
      </LayoutProvider>
    </LoginProvider>
  );
}
