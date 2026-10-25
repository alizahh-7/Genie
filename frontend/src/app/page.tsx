import Link from "next/link";
import { Shell, Btn } from "@/components/ui";
import Wake from "@/components/Wake";
import GenieDreamBackground from "@/components/GenieDreamBackground";
import DemoCards from "@/components/DemoCards";
import ServiceStatus from "@/components/ServiceStatus";
import TryYourOwn from "@/components/TryYourOwn";
import { CAPABILITIES, PRIVACY_POINTS, PROCESS } from "@/lib/home";

const H2 = "text-4xl sm:text-5xl";
const Section = ({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8 pb-20">
    <h2 id={`${id}-h`} className={`${H2} text-center`}>{title}</h2>
    {lead && <p className="mx-auto mb-9 mt-3 max-w-2xl text-center text-lg text-ivory/70">{lead}</p>}
    {!lead && <div className="mb-9" />}
    {children}
  </section>
);

export default function Landing() {
  return (
    <Shell>
      <Wake />
      <GenieDreamBackground />
      <div className="genie-home-content relative z-10">
        {/* 1. Meet Genie */}
        <section id="meet" aria-labelledby="meet-h" className="mx-auto max-w-3xl pb-16 pt-14 text-center sm:pb-20 sm:pt-20">
          <p className="rise mb-6 text-sm uppercase tracking-[.24em] text-gold">A wish-discovery companion</p>
          <h1 id="meet-h" className="rise text-6xl sm:text-8xl" style={{ animationDelay: "120ms" }}>Meet Genie.</h1>
          <p className="rise mx-auto mt-7 max-w-2xl text-xl text-ivory/85" style={{ animationDelay: "240ms" }}>A wish-discovery companion that helps families turn the little things someone loves into meaningful moments.</p>
          <p className="rise mx-auto mt-5 max-w-2xl text-base leading-relaxed text-ivory/70" style={{ animationDelay: "300ms" }}>Create a real story, add favourites, and invite loved ones to contribute memories. Genie builds a Taste Portrait with Qloo, generates personal wishes, and helps your family find Wish Makers who could make them happen.</p>
          <p className="rise mx-auto mt-8 max-w-xl font-serif text-3xl italic text-gold sm:text-4xl" style={{ animationDelay: "360ms" }}>Everyone deserves to be known before they go.</p>
          {/* 2. Start your own story */}
          <div id="start" className="rise mt-10 flex scroll-mt-8 flex-wrap justify-center gap-3" style={{ animationDelay: "480ms" }}>
            <Btn href="/start">Start a story</Btn>
            <Btn href="/demo" quiet>Explore the demo</Btn>
          </div>
          <p className="rise mt-6 text-sm text-ivory/65" style={{ animationDelay: "540ms" }}>No account needed. Skip anything, and delete everything at any time.</p>
          <div className="rise mt-5" style={{ animationDelay: "600ms" }}><ServiceStatus /></div>
        </section>

        <TryYourOwn />

        {/* 3. What Genie actually does */}
        <Section id="does" title="What Genie actually does" lead="These are working parts of the product. Some open right now. Others live inside a story you create, and each card says which.">
          <ul className="grid gap-5 sm:grid-cols-2">
            {CAPABILITIES.map((c, i) => (
              <li key={c.id} data-capability={c.id} className="rise glass flex flex-col rounded-3xl p-6" style={{ animationDelay: `${100 + i * 50}ms` }}>
                <p className="mb-2 text-xs uppercase tracking-[.18em] text-gold">{c.where === "now" ? "Opens now" : "Inside your story"}</p>
                <h3 className="text-2xl sm:text-3xl">{c.title}</h3>
                <p className="mt-2 flex-1 text-ivory/75">{c.text}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <Link href={c.href} data-capability-link className="font-medium text-gold underline underline-offset-4 hover:text-[#ffe09a]">{c.cta} →</Link>
                  {c.demoHref && <Link href={c.demoHref} data-capability-demo className="text-ivory/70 underline underline-offset-4 hover:text-gold">See it in the demo</Link>}
                </div>
              </li>))}
          </ul>
        </Section>

        {/* 4. How the process works */}
        <Section id="how" title="How it works">
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p, i) => <li key={p.title} className="glass rounded-3xl p-6"><p className="font-serif text-2xl text-gold">0{i + 1}</p><h3 className="mt-2 text-2xl">{p.title}</h3><p className="mt-2 text-ivory/70">{p.text}</p></li>)}
          </ol>
        </Section>

        {/* 5. Explore a fictional demo */}
        <Section id="demo" title="Explore Genie with a fictional story" lead="Want to see how it works before creating your own? Explore two prepared stories using fictional people and sample Wish Makers.">
          <DemoCards />
          <p className="mt-6 text-center text-sm text-ivory/60"><Link href="/demo" className="underline underline-offset-4 hover:text-gold">See how the guided story works</Link></p>
        </Section>

        {/* 6. Wish Makers and organisation pathways */}
        <Section id="pathways" title="Wish Makers and care organisations" lead="Genie is free for families. People and organisations who help make wishes happen have their own pathways.">
          <div className="grid gap-5 md:grid-cols-2">
            <div data-pathway="makers" className="glass rounded-3xl p-6"><h3 className="text-3xl">Become a Wish Maker</h3><p className="mt-2 text-ivory/75">Musicians, home cooks, storytellers, cafes and volunteers anywhere can apply. A person reviews every application, and in-person wishes go only to makers who passed a reference check.</p><div className="mt-4 flex flex-wrap gap-3"><Btn href="/makers/apply">Apply as a Wish Maker</Btn><Btn href="/maker/recover" quiet>Find my maker link</Btn></div></div>
            <div data-pathway="hospices" className="glass rounded-3xl p-6"><h3 className="text-3xl">For hospices and palliative-care teams</h3><p className="mt-2 text-ivory/75">Families use Genie for free. Care organisations can apply for a private coordination dashboard to open stories with consent, follow each wish, and keep or delete stories.</p><div className="mt-4 flex flex-wrap gap-3"><Btn href="/for-hospices">See the hospice pathway</Btn></div></div>
          </div>
        </Section>

        {/* 7. Privacy and trust */}
        <Section id="trust" title="Privacy and trust">
          <ul className="mx-auto max-w-3xl space-y-3">{PRIVACY_POINTS.map(p => <li key={p} className="glass flex gap-3 rounded-2xl px-5 py-4 text-ivory/80"><span aria-hidden="true" className="text-gold">✦</span>{p}</li>)}</ul>
        </Section>
      </div>
    </Shell>
  );
}
