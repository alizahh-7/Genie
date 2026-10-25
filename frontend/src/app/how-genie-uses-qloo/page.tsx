import { Shell, Card, Btn } from "@/components/ui";
import { COVERAGE, JOBS, LADDER } from "@/lib/qlooFacts";

export const metadata = { title: "How Genie uses Qloo", description: "What Qloo does in Genie, how well it covered our tests, and what happens when it does not know something." };

export default function HowGenieUsesQloo() {
  return (
    <Shell>
      <h1 className="rise pt-8 text-5xl">How Genie uses Qloo</h1>
      <p className="rise mb-10 mt-3 max-w-2xl text-ivory/80">Genie only works because Qloo knows what people love. Without it, Genie would be a chatbot guessing. Here is what Qloo does, how well it covered our tests, and what happens when it does not know something.</p>

      <section aria-labelledby="jobs-h" className="mb-12">
        <h2 id="jobs-h" className="mb-5 text-3xl">Three jobs</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {JOBS.map((j, i) => <Card key={j.title}><p className="text-gold">{i + 1}</p><h3 className="mt-1 text-2xl">{j.title}</h3><p className="mt-3 text-ivory/80">{j.text}</p></Card>)}
        </div>
        <p className="mt-4 max-w-2xl text-ivory/70">The Compare screen in every story puts a general AI’s wishes next to Genie’s, built from the same facts without Qloo, so you can see the difference. Every Qloo call is listed in plain language in the call log.</p>
      </section>

      <section aria-labelledby="coverage-h" className="mb-12">
        <h2 id="coverage-h" className="mb-5 text-3xl">How well Qloo covered our tests</h2>
        <Card>
          <p className="text-2xl">We tested {COVERAGE.total} favourites: Telugu, Hindi, Urdu and Tamil film songs, Western rock and pop, K-pop, Arabic and Latin music, regional dishes, places, and films.</p>
          <p className="mt-4 text-ivory/85">After our fixes, all {COVERAGE.total} land on something true and useful: {COVERAGE.exact} exactly, {COVERAGE.alternateSpelling} through another spelling, and {COVERAGE.viaArtistOrParent} through the artist or parent. Our first automatic run scored {COVERAGE.originalAutoScore}, and we tightened it after a hand review found two false matches.</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-sm">{COVERAGE.domains.map(d => <li key={d.name} className="rounded-full border border-ivory/25 px-3 py-1">{d.name}: {d.found}</li>)}</ul>
          <p className="mt-4 text-sm text-ivory/65">An honest note: Qloo has artists, films and places, but not individual songs or dishes. A song is found through its artist and a dish as a taste tag, and Genie says so on screen.</p>
        </Card>
      </section>

      <section aria-labelledby="ladder-h" className="mb-12">
        <h2 id="ladder-h" className="mb-5 text-3xl">When Qloo does not know</h2>
        <p className="mb-4 max-w-2xl text-ivory/80">Nothing ever fails empty. Genie moves down this ladder and always tells you where an item landed.</p>
        <ol className="space-y-3">{LADDER.map(l => <li key={l.level}><Card className="!p-5"><p><span className="mr-3 text-gold">{l.level}</span><span className="text-xl">{l.title}</span></p><p className="mt-1 text-ivory/80">{l.text}</p></Card></li>)}</ol>
      </section>

      <section aria-labelledby="limits-h" className="mb-12">
        <h2 id="limits-h" className="mb-4 text-3xl">What we do not claim</h2>
        <ul className="max-w-2xl list-disc space-y-2 pl-6 text-ivory/80">
          <li>The Wish Makers in this build are clearly labelled samples.</li>
          <li>Qloo knows songs, dishes and places. It does not know whether a home cook is good, so makers are matched through the artists, cuisines and places they connect to.</li>
          <li>Qloo receives the names of favourites. Genie collects no surnames, addresses, health details or ID numbers.</li>
          <li>Genie is not a medical service.</li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-3"><Btn href="/start">Start a story</Btn><Btn href="/demo" quiet>See a worked example</Btn></div>
    </Shell>
  );
}
