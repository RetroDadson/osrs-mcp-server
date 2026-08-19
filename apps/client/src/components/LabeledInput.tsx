import { forwardRef, useState, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  /** Returns an error message, or null when valid. Runs on blur. */
  validate?: (value: string) => string | null;
}

export const LabeledInput = forwardRef<HTMLInputElement, Props>(function LabeledInput(
  { id, label, validate, onBlur, className, ...rest },
  ref,
) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="labeled-input">
      <label htmlFor={id} className="sr-only-label">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        className={[error ? 'invalid' : '', className ?? ''].filter(Boolean).join(' ')}
        onBlur={(event) => {
          if (validate) setError(validate(event.currentTarget.value));
          onBlur?.(event);
        }}
        {...rest}
      />
      {error && <div className="validation-error">{error}</div>}
    </div>
  );
});
