import { Link } from 'react-router-dom';
import { MenButton } from '../components/MenButton.js';
import { SocialLinks } from '../components/SocialLinks.js';
import { useGroup } from '../state/GroupContext.js';

export function Home(): React.JSX.Element {
  const { isAuthenticated } = useGroup();

  return (
    <div className="page-container">
      <SocialLinks />
      <div className="home__container">
        <h1>OSRS MCP</h1>
        <div className="home__links">
          <Link to="/create-group">
            <MenButton>Get started</MenButton>
          </Link>
          {isAuthenticated ? (
            <Link to="/group">
              <MenButton>Go to group</MenButton>
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
