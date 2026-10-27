# Public benchmark publication plan

Spec: ../specs/2026-10-27-publish-benchmarks-design.md

1. Add tools/benchmark-snapshot.mjs to derive a public aggregate from saved
   search verdicts and an already scored form-round JSON. Write a focused
   behavioral test for counts, scoring, missing observations and output privacy.
   Generate web/public/benchmark-results.json with evidence hashes and run URL.
2. Build web/public/benchmark.html with existing site styles and a narrowly
   scoped benchmark.css plus benchmark.js. Display role and place separately;
   include all tools, sample sizes, source links and honest unjudged state.
   Add links in index.html, research.html and compare.html, plus sitemap.xml.
3. Run the focused data test and lint. Render current live before and proposed
   after at 1440 and 390 pixels. Verify no page overflow and actual values.
   Open the relevant screenshots in macOS Preview and ask for visual approval.
4. After approval, review against the acceptance criteria, host screenshots,
   run the normal fast gate, commit and ship through the public ship tool.
   Watch current-head checks/comments; owner alone merges.

Review focus: unequal/absent search samples; single-repeat spread; stale versus
unjudged builds; summary-only publication; narrow layouts and failed data fetch.
