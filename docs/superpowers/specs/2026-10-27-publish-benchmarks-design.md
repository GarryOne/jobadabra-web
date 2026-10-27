# Publish the job-search and form-filling benchmarks

Owner request: publish both benchmarks even when Jobadabra is not first,
keeping the current website design system. Publication itself is authorized;
the owner's standing rule requires approval of the rendered UI before its commit.

## Observable behavior

- Public /benchmark presents separate search and form-filling sections.
- Reuse the existing navigation, footer, dark navy/amber/teal tokens, fonts,
  page-head, page-jump, comparison table, and detail disclosure components.
- Publish the 27 October search snapshot and latest completely judged fair
  form round (40506831190). Include all observed contestants, accurate counts,
  dates, product build, source links and downloadable aggregate data.
- State unequal search coverage, small samples, strict place versus remote,
  and that one form repeat does not estimate variability.
- Distinguish newer unjudged form captures from the scored round. Never
  substitute the older fixed-set result or claim an improvement without judging.
- Only public aggregate counts and fictional persona labels reach this page.
  No field answers, applicant details, credentials or admin snapshots.

## Acceptance criteria

- Aggregate counts reproduce the saved evidence; form scores are sorted fairly.
- Search row counts sum to 957; deduplicated judged pools sum to 896.
- Single-repeat form spread is unavailable, never presented as zero variance.
- Page works at 1440 and 390 pixels, including table overflow and navigation.
- Discoverable from the homepage and research page; included in the sitemap.
- Render actual before/after desktop/mobile previews and open them in Preview
  before the UI approval prompt. Keep hosted images in the PR body.
- Focused tests, lint and applicable fast gate pass; owner merges/deploys.

## Constraints and non-goals

No AI calls, new contestants, paid reruns, judging-rule changes, or quota changes.
No admin/auth changes, live user data, schedules or new design system.
The dated public snapshot is versioned; it does not claim automatic refresh.
Only owner merges. Existing watcher coverage stays intact.

## Progress

- [x] Recover latest scored evidence and current website components.
- [x] Build reproducible aggregate snapshot and focused validation.
- [x] Implement page with existing site components and discoverability.
- [x] Render desktop/mobile, show in Preview, obtain visual approval.
- [ ] Run focused checks, independent review and ship existing task PR.
- [ ] Follow checks/comments and hand the owner the merge/deploy result.

## Visual revision requested by owner

27 October: make the page more modern, alive and colorful. Use the existing
navy surfaces and type families. The owner refined the palette to yellowish:
bright amber for Jobadabra, gold for positive verdicts, ochre for remote,
dimmer amber for misses and empty answers, navy-gray for unknowns. Derive
these shades from existing site tokens, like the Coverage heatmap. Lead with compact colored
result boards; keep exact comparison tables in native disclosures. Every segment
has an adjacent count label so color is never the only evidence. Retain all
contestants, dates, caveats and current sample sizes. Fresh desktop and phone
previews must be approved before the first visual commit.

Owner approved the amber revision and instructed “ship”. Actual Worker previews
at 1440 and 390px passed counts, rank, location breakdown, disclosure/picker
and overflow checks. Independent publication review found no blocking issues.
