"use client";
import { useState } from "react";
import { Card } from "@/components/ui";

const STEPS = [
  { title: "Apply", text: "A hospice or palliative-care team sends a short application. A person from the Genie team reads it. Nothing is shared until we speak." },
  { title: "Open a private page", text: "Once approved, the coordinator receives a private link by email. The link is the login, so keep it safe. Colleagues are added as coordinators, volunteers or viewers." },
  { title: "Open a story with consent", text: "Staff open a story only after confirming consent from the person or their family. Stories carry a label such as “Story A”, never a medical record number, and are kept for 90 days unless extended." },
  { title: "Follow each wish to done", text: "For every wish, staff see whether a Wish Maker has been asked, has accepted, or has finished. Contact details stay private until a maker accepts. Every action is recorded in an activity log." },
];

const SEES = ["Open, paused and closed stories at a glance", "Stories that expire soon, highlighted", "Wishes asked, accepted and done", "A team page with roles, and an activity log", "A clear delete option that removes a story and everything under it"];

/** "How a hospice uses Genie". Drop a screenshot at frontend/public/hospice-dashboard.png and it appears here automatically. */
export default function HospiceWalkthrough() {
  const [hasShot, setHasShot] = useState(true);
  return (
    <section aria-labelledby="how-hospice-h" className="mb-12">
      <h2 id="how-hospice-h" className="mb-5 text-3xl">How a hospice uses Genie</h2>
      <ol className="grid gap-4 sm:grid-cols-2">{STEPS.map((s, i) => <li key={s.title}><Card className="h-full"><p className="text-gold">{i + 1}</p><h3 className="mt-1 text-2xl">{s.title}</h3><p className="mt-2 text-ivory/80">{s.text}</p></Card></li>)}</ol>
      <h3 className="mb-3 mt-8 text-2xl">What the team sees</h3>
      <ul className="max-w-2xl list-disc space-y-1 pl-6 text-ivory/80">{SEES.map(s => <li key={s}>{s}</li>)}</ul>
      {hasShot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/hospice-dashboard.png" alt="The Genie coordination dashboard for a sample organisation, showing stories, their wishes and how far each has come" onError={() => setHasShot(false)} className="mt-6 w-full rounded-2xl border border-ivory/20" />
      )}
      {hasShot && <p className="mt-2 text-sm text-ivory/60">Sample organisation, demo data.</p>}
    </section>
  );
}
