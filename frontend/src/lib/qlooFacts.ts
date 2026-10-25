/** Facts shown on /how-genie-uses-qloo. Numbers come from docs/coverage-report.md (our own inputs only, no Qloo data). */
export const COVERAGE = {
  total: 40,
  exact: 33,
  alternateSpelling: 1,
  viaArtistOrParent: 6,
  originalAutoScore: "38 of 40",
  domains: [
    { name: "Music", found: "21 of 23" }, { name: "Film", found: "4 of 4" }, { name: "TV", found: "1 of 1" },
    { name: "Food", found: "6 of 6" }, { name: "Places", found: "6 of 6" },
  ],
} as const;

export const LADDER: { level: number; title: string; text: string }[] = [
  { level: 1, title: "Exact match", text: "The item is found in Qloo and its taste tags are used." },
  { level: 2, title: "Another spelling", text: "A different spelling or script is tried (for example a transliterated name)." },
  { level: 3, title: "One step up", text: "A song is looked up through its artist, a dish through its cuisine, a place through its city." },
  { level: 4, title: "Era and place", text: "When little is known, Qloo’s audience signals for their era and region give a starting portrait, marked as likely." },
  { level: 5, title: "Not in Qloo", text: "The item is kept and labelled “Suggested by AI, not in Qloo”. It is left out of Qloo scoring." },
  { level: 6, title: "Qloo unavailable", text: "A remembered answer is used if there is one. Otherwise a calm message and a retry. Never a blank screen." },
];

export const JOBS: { title: string; text: string }[] = [
  { title: "Understand", text: "Every favourite a family names is looked up in Qloo’s taste graph. Its taste tags become the portrait, and each item says whether the family told us or Genie is guessing." },
  { title: "Discover", text: "Qloo’s taste links (“people like them also love”) suggest wishes the family may not have thought of. A discovery always says it is a guess." },
  { title: "Match", text: "Each wish is matched to Wish Makers by comparing Qloo entities and tags. Every match shows its reasons, and whether Qloo or a plain name match found it." },
];

export const coverageSum = () => COVERAGE.exact + COVERAGE.alternateSpelling + COVERAGE.viaArtistOrParent;
