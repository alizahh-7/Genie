"use client";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { personPath } from "@/lib/api";
import { PERSON_EXPIRED_CODE, PERSON_EXPIRED_MESSAGE } from "@/lib/errors";
import { buildTasteMap, pickProvenanceNote } from "@/lib/tasteMap";
import { useNotices } from "@/lib/useNotices";
import type { Person, PortraitItem, Wish } from "@/lib/types";
import { Page, useLoad, Wait } from "@/components/Extra";
import { Card, ErrorBox } from "@/components/ui";
import { QlooPanel } from "@/components/QlooLayer";
import { TasteMap } from "@/components/TasteMap";

export default function TasteMapPage() {
  const { id } = useParams<{ id: string }>();
  const person = useLoad<Person>(`/persons/${encodeURIComponent(id)}`, { notFound: { message: PERSON_EXPIRED_MESSAGE, code: PERSON_EXPIRED_CODE } });
  const portrait = useLoad<{ items: PortraitItem[] }>(personPath(id, "portrait"));
  const wishes = useLoad<Wish[]>(personPath(id, "wishes"));
  const notices = useNotices();
  const model = useMemo(() => (person.data ? buildTasteMap(person.data.first_name, portrait.data?.items, wishes.data) : null), [person.data, portrait.data, wishes.data]);
  const busy = person.busy || portrait.busy || wishes.busy;
  const error = person.error || portrait.error || wishes.error;
  const retry = () => { void person.reload(); void portrait.reload(); void wishes.reload(); };
  return <Page id={id} title="Taste Map">
    <p className="mb-6 max-w-2xl text-ivory/70">How what the family told Genie connects to the tastes Qloo found, and to one thing Qloo guessed they might love.</p>
    {busy ? <Wait text="Drawing the map…" /> : error ? <ErrorBox message={error} onRetry={retry} /> : !model ? <Card>Nothing to map yet.</Card> : <>
      <QlooPanel showStrip={false} />
      <TasteMap model={model} note={pickProvenanceNote(notices)} />
    </>}
  </Page>;
}
