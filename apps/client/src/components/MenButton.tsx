import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean };

export function MenButton({ small, className, children, ...rest }: Props): React.JSX.Element {
  const classes = ['men-button', small ? 'small' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
