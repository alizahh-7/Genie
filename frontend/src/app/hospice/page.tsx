import { Shell, Card, Sample } from "@/components/ui";
const rows = [["Nani", "3 wishes", "1 accepted"], ["Rao", "2 wishes", "2 in progress"], ["Mira", "4 wishes", "1 done"]];
export default function Hospice() {
  return (
    <Shell>
      <h1 className="text-3xl text-dusk mb-1">Coordination dashboard<Sample /></h1>
      <p className="mb-6 text-dusk/80">Mockup only. Fictional data. A view for hospice volunteer coordinators.</p>
      {rows.map(r => <Card key={r[0]}><div className="flex flex-wrap justify-between"><b>{r[0]}</b><span>{r[1]}</span><span>{r[2]}</span></div></Card>)}
    </Shell>
  );
}
