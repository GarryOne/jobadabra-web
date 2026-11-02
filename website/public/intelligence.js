// The AI page's stage tabs: the tab of the section in view is underlined (aria-current). Without script the first tab stays marked.
const tabs = [...document.querySelectorAll('.ai-tabs a')];
if ('IntersectionObserver' in window) {
  const seen = new Map();
  const pick = () => { const open = [...seen].filter(([, on]) => on).map(([id]) => id); const id = open[0]; if (id) tabs.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${id}`)); };
  const watch = new IntersectionObserver(entries => { entries.forEach(e => seen.set(e.target.id, e.isIntersecting)); pick(); }, {rootMargin: '-20% 0px -60% 0px'});
  tabs.forEach(a => { const section = document.querySelector(a.getAttribute('href')); if (section) { seen.set(section.id, false); watch.observe(section); } });
}
