import { Shell, Btn } from "@/components/ui";
export default function Landing() {
  return (
    <Shell>
      <h1 className="text-4xl sm:text-5xl text-dusk mt-8 mb-4">Everyone deserves to be known before they go.</h1>
      <p className="mb-8 max-w-xl">Tell us a little about someone you love. Genie learns who they were through what they loved, suggests wishes only they would recognize, and finds people who can make them happen.</p>
      <div className="flex flex-wrap gap-3 mb-10"><Btn href="/person/demo/portrait">Try the demo</Btn><Btn href="/start" quiet>Start for someone I love</Btn></div>
      <p className="text-sm text-dusk/70">No account needed. You can skip any question and delete everything at any time.</p>
    </Shell>
  );
}
