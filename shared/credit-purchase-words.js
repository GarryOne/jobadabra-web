// The measured credit explanation shared by checkout and Pro mail, using the same application estimate as the app.
import {buysSuffix} from '../desktop/renderer/credit-buys.js';
import {CREDIT} from './pro-packages.js';

/** Explain only credit this purchase grants; Pro alone and unknown kinds make no credit claim. */
export function purchaseCreditWords(kind) {
  const micro = Object.hasOwn(CREDIT, kind) ? CREDIT[kind] : 0;
  if (!micro) return '';
  return `€${micro / 1e6} of AI credit${buysSuffix(micro / 1e6)}. An application means a letter, CV tailoring and form answers. Actual usage varies. Pro uses smarter in-house AI while you have credit.`;
}
