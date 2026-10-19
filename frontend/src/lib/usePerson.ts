"use client";
import { useEffect, useState } from "react";
import { getPerson } from "./api";
import { Person } from "./types";
export function usePerson(id: string) {
  const [p, setP] = useState<Person | null>(null); const [sample, setSample] = useState(false);
  useEffect(() => { getPerson(id).then(r => { setP(r.person); setSample(r.sample); }); }, [id]);
  return { p, sample };
}
