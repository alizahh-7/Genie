"use client";
import { useParams } from "next/navigation";
import { Shell, Card, Tag, Btn, Loading } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
export default function WishBook() {
  const { id } = useParams<{ id: string }>(); const { p } = usePerson(id);
  if (!p) return <Loading id={id} />;
  return (
    <Shell id={id}>
      <h1 className="text-5xl text-dusk mt-4 mb-2">{p.name}</h1>
      <p className="text-xl mb-8 text-dusk/80">Known through what they loved.</p>
      <h2 className="text-2xl mb-3">What they loved</h2>
      <div className="mb-8">{p.items.map(i => <Tag key={i.id}>{i.name}</Tag>)}</div>
      <h2 className="text-2xl mb-3">Wishes</h2>
      {p.wishes.map(w => <Card key={w.id}><h3 className="text-xl">{w.title}</h3><p>{w.description}</p></Card>)}
      <h2 className="text-2xl mt-8 mb-3">Things we learned about them</h2>
      {p.learned.map(l => <p key={l} className="mb-2 font-serif text-xl">{l}</p>)}
      <div className="noprint mt-8"><Btn onClick={() => window.print()}>Print or save as PDF</Btn></div>
    </Shell>
  );
}
