import { MenButton } from './MenButton.js';

export function DonateButton(): React.JSX.Element {
  return (
    // TODO: replace with the real donation link once set up (Ko-fi/PayPal/GitHub Sponsors/etc.)
    <a href="#" target="_blank" rel="noreferrer">
      <MenButton>
        <img loading="lazy" src="/images/kofi_p_logo_nolabel.webp" height={20} width={30} alt="" />
        <span>Support</span>
      </MenButton>
    </a>
  );
}
