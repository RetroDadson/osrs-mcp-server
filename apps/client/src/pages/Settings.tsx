import { MemberRow } from '../components/MemberRow.js';
import { useLogin } from '../state/LoginContext.js';
import {
  getLayoutDirection,
  getTheme,
  setLayoutDirection as persistLayoutDirection,
  setTheme as persistTheme,
  type LayoutDirection,
  type Theme,
} from '../state/storage.js';
import { useState } from 'react';

const MAX_MEMBERS = 5;

export function Settings(): React.JSX.Element {
  const { members } = useLogin();
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [layout, setLayout] = useState<LayoutDirection>(getLayoutDirection());

  function handleThemeChange(value: Theme): void {
    persistTheme(value);
    setTheme(value);
  }

  function handleLayoutChange(value: LayoutDirection): void {
    persistLayoutDirection(value);
    setLayout(value);
  }

  return (
    <div className="login-settings">
      <section className="login-settings__members panel">
        <h3>Member settings</h3>
        {members.map((member, index) => (
          <MemberRow key={member.name} member={member.name} memberNumber={index + 1} />
        ))}
        {members.length < MAX_MEMBERS && <MemberRow memberNumber={members.length + 1} />}
      </section>

      <section className="login-settings__appearance panel">
        <h3>Appearance settings</h3>
        <fieldset>
          <legend>Theme</legend>
          <label>
            <input type="radio" name="theme" checked={theme === 'light'} onChange={() => handleThemeChange('light')} />{' '}
            Light
          </label>
          <label>
            <input type="radio" name="theme" checked={theme === 'dark'} onChange={() => handleThemeChange('dark')} />{' '}
            Dark
          </label>
        </fieldset>
        <fieldset>
          <legend>Dock panels</legend>
          <label>
            <input type="radio" name="layout" checked={layout === 'row'} onChange={() => handleLayoutChange('row')} />{' '}
            Left
          </label>
          <label>
            <input
              type="radio"
              name="layout"
              checked={layout === 'row-reverse'}
              onChange={() => handleLayoutChange('row-reverse')}
            />{' '}
            Right
          </label>
        </fieldset>
      </section>
    </div>
  );
}
