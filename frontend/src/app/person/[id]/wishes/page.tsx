"use client";
import { useParams } from "next/navigation";
import { personPath } from "@/lib/api";
import type { Wish } from "@/lib/types";
import { WishCard } from "@/components/story";
import { Page, useLoad, Wait } from "@/components/Extra";
import { Card, ErrorBox } from "@/components/ui";
import { QlooPanel } from "@/components/QlooLayer";
import { WishRequests } from "@/components/WishRequests";

export default function Wishes() {
  const { id } = useParams<{ id: string }>();
  const { data, error, busy, reload } = useLoad<Wish[]>(personPath(id, "wishes"));
  return <Page id={id} title="Wishes & Wish Makers">{busy ? <Wait /> : error ? <ErrorBox message={error} onRetry={reload} /> : !data?.length ? <Card>No wishes yet. Gather their story first.</Card> : <div className="space-y-8"><QlooPanel showStrip={false} />{data.map((w, i) => <section key={w.id}><WishCard wish={w} i={i} /><WishRequests id={id} wish={w} /></section>)}</div>}</Page>;
}
