// Every mail template as the person sees it, filled with made-up sample data (owner, 26 Oct 2026: "every template rendered with sample data"). Built by shared/mail.js compose(), the same
// frame as a real send, with example links (no real address, no signed token). A template without a sample here fails test/admin/email.test.js, so a new template cannot be left off the page.
import {compose} from '../shared/mail.js';
import {OFFERS} from '../shared/pro-packages.js';
import {TEMPLATES} from '../shared/mail-templates.js';

const SITE = 'https://www.jobadabra.top', PRICING = `${SITE}/pricing`;
const jobs = [{title: 'Dialysis Nurse', company: 'Demo Klinik', place: 'Zurich', mode: 'On-site', fit: 88, url: `${SITE}/example`}, {title: 'Ward Nurse', company: 'Demo Spital', place: 'Basel', mode: 'Hybrid', fit: 81, url: `${SITE}/example`}];

export const SAMPLES = {
  'message': {subject: 'Your application to Demo Klinik was sent', html: '<p>We sent your application for <b>Dialysis Nurse</b>.</p>', text: 'We sent your application for Dialysis Nurse.', buttons: [{text: 'Open in Jobadabra', url: SITE}], confirmUrl: `${SITE}/confirm?example`},
  'welcome': {confirmUrl: `${SITE}/confirm?example`},
  'account-code': {code: '482913'},
  'digest': {matches: jobs, total: 12, openUrl: SITE},
  'trial-left': {left: 5},
  'trial-ending': {days: 3, pricingUrl: PRICING},
  'always-on-paused': {reason: 'trial-over', pricingUrl: PRICING, pro: true},
  'pro-launch': {pro: OFFERS[0].price, proAi: OFFERS[1].price, pricingUrl: PRICING},
};

export function previews() {
  return Object.keys(TEMPLATES).map(name => {
    const spec = TEMPLATES[name], links = spec.essential ? null : {stop: `${SITE}/unsubscribe?example`, settings: `${SITE}/email-settings?example`};
    try { return {name, list: spec.list, essential: !!spec.essential, ...compose(name, SAMPLES[name], links)}; } catch (error) { return {name, list: spec.list, essential: !!spec.essential, error: error.message}; }
  });
}
