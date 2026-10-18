import { useEffect } from 'react';
import { track } from '../analytics';

export const DONATE_URL = 'https://paypal.me/dovyp';

/** Donation ask from RecordSeek's creator, with a button out to PayPal. */
export function Donate() {
  useEffect(() => {
    track('donate_viewed');
  }, []);

  return (
    <main className="donate">
      <img className="donate-photo" src={`${import.meta.env.BASE_URL}images/dovy.jpg`} alt="Dovy Paukstys" />
      <h1>Donate to RecordSeek</h1>
      <p>
        Hi, I&apos;m Dovy. I built RecordSeek in 2013 and still run it myself. It&apos;s free, with no ads, and every
        source you save makes your tree a little more trustworthy.
      </p>
      <p>
        Servers, developer accounts, and the time to keep up with every record site add up. If RecordSeek has saved you
        time, a donation of any size helps keep it going.
      </p>
      <a
        className="primary donate-button"
        href={DONATE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('donate_clicked')}
      >
        Donate with PayPal
      </a>
      <p className="donate-thanks">Thank you. Your ancestors thank you too.</p>
    </main>
  );
}
