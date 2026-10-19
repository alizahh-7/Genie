"use client";
import { useParams } from "next/navigation";
import { Shell, Card, Loading } from "@/components/ui";
import { usePerson } from "@/lib/usePerson";
export default function Bedside() {
  const { id } = useParams<{ id: string }>(); const { p } = usePerson(id);
  if (!p) return <Loading id={id} />;
  const S = ({ t, l }: { t: string; l: string[] }) => <Card><h2 className="text-xl mb-2">{t}</h2>{l.map(x => <p key={x}>{x}</p>)}</Card>;
  return (
    <Shell id={id}>
      <h1 className="text-3xl text-dusk mb-1">Bedside Kit</h1>
      <p className="mb-6 text-dusk/80">Small things for comfort and connection. Please check with the care team before changing anything in the room.</p>
      <S t="Songs to play softly" l={p.bedside.playlist} /><S t="Gentle changes to the room" l={p.bedside.setting} /><S t="What visitors can do" l={p.bedside.visitors} />
    </Shell>
  );
}
