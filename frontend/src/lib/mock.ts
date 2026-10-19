import { Person } from "./types";
const mk = (name: string, type: string, city: string, remote_ok: boolean, score: number, status: string) => ({ name, type, city, remote_ok, score, status });
export const DEMO: Person = {
  id: "demo", name: "Nani",
  items: [
    { id: "1", domain: "Music", name: "Lag Jaa Gale", tags: ["hindi classic", "1960s film", "romantic"], label: "told" },
    { id: "2", domain: "Music", name: "Pyar Hua Ikrar Hua", tags: ["hindi classic", "1950s film", "duet"], label: "told" },
    { id: "3", domain: "Food", name: "Haleem", tags: ["hyderabadi", "slow cooked", "festive"], label: "told" },
    { id: "4", domain: "Place", name: "Evenings near Charminar", tags: ["hyderabad", "old city", "bazaar"], label: "likely" },
  ],
  wishes: [
    { id: "w1", title: "An evening of her songs", description: "A singer performs her favourite old Hindi film songs, by video or in the room.", mode: "remote",
      makers: [mk("Asha (sample singer)", "Musician", "Hyderabad", true, 92, "accepted"), mk("Ravi (sample harmonium)", "Musician", "Pune", true, 81, "suggested")] },
    { id: "w2", title: "Haleem the way she made it", description: "A home cook recreates a slow cooked haleem to share with the family.", mode: "in-person",
      makers: [mk("Fatima (sample home cook)", "Home cook", "Hyderabad", false, 88, "suggested")] },
    { id: "w3", title: "A walk through the old city, in pictures", description: "A storyteller shares photos and stories of Charminar in the evening.", mode: "remote",
      makers: [mk("Imran (sample storyteller)", "Storyteller", "Hyderabad", true, 76, "suggested")] },
  ],
  qlooLog: ["resolve: Lag Jaa Gale, entity found, 4 tags", "resolve: Pyar Hua Ikrar Hua, found under another spelling", "resolve: Haleem, entity found, 3 tags", "expand: era 1950s to 1960s, region Hyderabad, 6 related entities", "match: 3 wishes scored against 15 sample makers"],
  generic: ["Visit a famous landmark", "Make a photo album", "Listen to a favourite playlist"],
  learned: ["She loved songs that told a small story.", "Food was how she said she cared.", "Evenings in the old city were her favourite hour."],
  bedside: { playlist: ["Lag Jaa Gale", "Pyar Hua Ikrar Hua"], setting: ["Soft lamp instead of overhead light", "Window slightly open if the care team agrees"], visitors: ["Sit close and hum along", "Read her a favourite memory aloud"] },
};
