"use client";
import { useParams } from "next/navigation";
import { Shell, Card, Loading } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
export default function Compare() {
  const { id } = useParams<{ id: string }>(); const { p } = usePerson(id);
  if (!p) return <Loading id={id} />;
  return (
    <Shell id={id}>
      <h1 className="text-3xl text-dusk mb-6">A general AI and Genie, side by side</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><h2 className="text-xl mb-2">A general AI</h2>{p.generic.map(g => <p key={g} className="mb-2">{g}</p>)}</Card>
        <Card><h2 className="text-xl mb-2">Genie, using Qloo</h2>{p.wishes.map(w => <p key={w.id} className="mb-2">{w.title}</p>)}</Card>
      </div>
      <Card><h2 className="text-xl mb-2">Every Qloo call</h2>{p.qlooLog.map(l => <p key={l} className="text-sm">{l}</p>)}</Card>
    </Shell>
  );
}
