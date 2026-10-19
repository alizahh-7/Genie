"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Shell, Card, Btn } from "@/components/ui";
import { sendCircle } from "@/lib/api";
const Q = ["What song did they love to hear?", "What food did they make, or ask for?", "Where did they feel most themselves?", "What did they love to watch or listen to?", "What would you like others to know about them?"];
export default function Circle() {
  const { token } = useParams<{ token: string }>();
  const [a, setA] = useState<string[]>(Q.map(() => "")); const [name, setName] = useState(""); const [ok, setOk] = useState(false); const [done, setDone] = useState(false);
  if (done) return <Shell><h1 className="text-3xl text-dusk mb-2">Thank you.</h1><p>Your answers help us know them better.</p></Shell>;
  return (
    <Shell>
      <h1 className="text-3xl text-dusk mb-2">Help us know them</h1>
      <p className="mb-6 text-dusk/80">Five gentle questions, about two minutes. Skip any you like.</p>
      <label>Your first name<input className="w-full rounded-lg border border-dusk/30 bg-white px-4 py-3 mb-4" value={name} onChange={e => setName(e.target.value)} /></label>
      {Q.map((q, i) => <label key={q}>{q}<textarea rows={2} className="w-full rounded-lg border border-dusk/30 bg-white px-4 py-3 mb-4" value={a[i]} onChange={e => setA(a.map((x, j) => j === i ? e.target.value : x))} /></label>)}
      <Card><label className="flex gap-3"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
        <span className="text-base">I understand that the family who invited me, and Genie, will see my answers and my first name.</span></label></Card>
      <Btn disabled={!ok} onClick={async () => { await sendCircle(token, { contributor_first_name: name, answers: a, consent_given: true }); setDone(true); }}>Send my answers</Btn>
    </Shell>
  );
}
