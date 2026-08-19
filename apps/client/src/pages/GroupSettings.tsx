import { MemberRow } from '../components/MemberRow.js';
import { useGroup } from '../state/GroupContext.js';
import { getLayoutDirection, getTheme, setLayoutDirection, setTheme, type LayoutDirection, type Theme } from '../state/storage.js';
import { useState } from 'react';

const MAX_MEMBERS = 5;

export function GroupSettings(): React.JSX.Element {
  const { members } = useGroup();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [layout, setLayoutState] = useState<LayoutDirection>(getLayoutDirection());

  function handleThemeChange(value: Theme): void {
    setTheme(value);
    setThemeState(value);
  }

  function handleLayoutChange(value: LayoutDirection): void {
    setLayoutDirection(value);
    setLayoutState(value);
  }

  return (
    <div className="group-settings">
      <section className="group-settings__members rsborder rsbackground">
        <h3>Member settings</h3>
        {members.map((member, index) => (
          <MemberRow key={member.name} member={member.name} memberNumber={index + 1} />
        ))}
        {members.length < MAX_MEMBERS && <MemberRow memberNumber={members.length + 1} />}
      </section>

      <section className="group-settings__appearance rsborder rsbackground">
        <h3>Appearance settings</h3>
        <fieldset>
          <legend>Theme</legend>
          <label>
            <input type="radio" name="theme" checked={theme === 'light'} onChange={() => handleThemeChange('light')} />
            Light
          </label>
          <label>
            <input type="radio" name="theme" checked={theme === 'dark'} onChange={() => handleThemeChange('dark')} />
            Dark
          </label>
        </fieldset>
        <fieldset>
          <legend>Dock panels</legend>
          <label>
            <input type="radio" name="layout" checked={layout === 'row'} onChange={() => handleLayoutChange('row')} />
            Left
          </label>
          <label>
            <input
              type="radio"
              name="layout"
              checked={layout === 'row-reverse'}
              onChange={() => handleLayoutChange('row-reverse')}
            />
            Right
          </label>
        </fieldset>
      </section>
    </div>
  );
}
