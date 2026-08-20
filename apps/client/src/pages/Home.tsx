import { Link } from 'react-router-dom';
import { MenButton } from '../components/MenButton.js';
import { SocialLinks } from '../components/SocialLinks.js';
import { useLogin } from '../state/LoginContext.js';

export function Home(): React.JSX.Element {
  const { isAuthenticated } = useLogin();

  return (
    <div className="page-container">
      <SocialLinks />
      <div className="home__container panel">
        <h1>OSRS MCP</h1>
        <div className="home__links">
          <Link to="/create-login">
            <MenButton>Get started</MenButton>
          </Link>
          {isAuthenticated ? (
            <Link to="/manage">
              <MenButton>Continue</MenButton>
            </Link>
          ) : (
            <Link to="/login">
              <MenButton>Login</MenButton>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
