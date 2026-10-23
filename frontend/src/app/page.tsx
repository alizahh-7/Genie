import { Shell, Btn } from "@/components/ui";
import Wake from "@/components/Wake";
import GenieDreamBackground from "@/components/GenieDreamBackground";
import DemoCards from "@/components/DemoCards";

const steps = [
  ["Tell us what they loved", "A song, a dish, a place. Even one is enough."],
  ["See who they were", "A quiet portrait, with honest labels on everything."],
  ["Find wishes only they would recognize", "Small, personal ideas. You decide what to keep."],
];
export default function Landing() {
  return (
    <Shell>
      <Wake />
      <GenieDreamBackground />
      <div className="genie-home-content relative z-10">
        <section className="mx-auto max-w-3xl pb-16 pt-14 text-center sm:pt-20 sm:pb-20">
          <p className="rise mb-6 text-sm uppercase tracking-[.24em] text-gold">For someone you love</p>
          <h1 className="rise text-5xl sm:text-7xl" style={{ animationDelay: "120ms" }}>Nani loved a song, a dish and a place.</h1>
          <p className="rise mx-auto mt-7 max-w-2xl text-xl text-ivory/85" style={{ animationDelay: "240ms" }}>A general AI might suggest listening to music together. Genie uses taste evidence to help the family discover a more personal wish, and to find someone who can make it happen.</p>
          <p className="rise mt-4 text-xs text-ivory/55" style={{ animationDelay: "300ms" }}>An illustration of the idea, not a live result.</p>
          <p className="rise mx-auto mt-8 max-w-xl font-serif text-3xl italic text-gold sm:text-4xl" style={{ animationDelay: "360ms" }}>Everyone deserves to be known before they go.</p>
          <div className="rise mt-10 flex flex-wrap justify-center gap-3" style={{ animationDelay: "480ms" }}>
            <Btn href="/demo?who=nani">Try the demo</Btn><Btn href="/start" quiet>Start for someone I love</Btn>
          </div>
          <p className="rise mt-6 text-sm text-ivory/65" style={{ animationDelay: "560ms" }}>No account needed. Skip anything, and delete everything at any time.</p>
        </section>
        <section aria-labelledby="meet" className="pb-16">
          <h2 id="meet" className="rise mb-2 text-center text-4xl sm:text-5xl" style={{ animationDelay: "620ms" }}>Meet someone</h2>
          <p className="rise mx-auto mb-8 max-w-xl text-center text-ivory/70" style={{ animationDelay: "660ms" }}>Two fictional people, so you can see how Genie works without anyone&apos;s real story.</p>
          <DemoCards />
        </section>
        <section className="grid gap-5 pb-16 sm:grid-cols-3">{steps.map(([t, d], i) => (
          <div key={t} className="rise glass rounded-3xl p-6" style={{ animationDelay: `${800 + i * 120}ms` }}>
            <p className="font-serif text-2xl text-gold">0{i + 1}</p><h2 className="mt-2 text-3xl">{t}</h2><p className="mt-2 text-ivory/70">{d}</p>
          </div>))}
        </section>
      </div>
    </Shell>
  );
}
