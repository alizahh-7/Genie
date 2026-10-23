"use client";
import { useParams } from "next/navigation";
import { api, personPath } from "@/lib/api";
import { COMPARE_NOT_GENERATED } from "@/lib/errors";
import { Page, useLoad, Wait, Action } from "@/components/Extra";
import { CleanData, hasData } from "@/components/CleanData";
import { QlooCallList } from "@/components/story";
import { Card, ErrorBox } from "@/components/ui";

type Comparison = {
  generic?: { available?: boolean; wishes?: unknown[]; message?: string };
  genie?: { wishes?: unknown[]; qloo_log?: unknown[] };
  evidence?: unknown;
  note?: string;
};

export default function Compare() {
  const { id } = useParams<{ id: string }>();
  const path = personPath(id, "compare");
  const { data, error, busy, reload, setData, status } = useLoad<Comparison>(path, { notFound: { message: COMPARE_NOT_GENERATED } });
  const generic = data?.generic;
  const logRows = Array.isArray(data?.genie?.qloo_log) ? data?.genie?.qloo_log : [];
  return <Page id={id} title="A general AI vs Genie">
    <p className="mb-5">Compare the generic suggestions with the Qloo-grounded experience.</p>
    <Action label="Run a new comparison" task={() => api<Comparison>(path, { method: "POST", timeout: 90000 })} onDone={setData} />
    {busy ? <Wait /> : error ? (status === 404
      ? <Card className="mt-6"><p>{error}</p><p className="mt-2 text-sm text-navy/70">Use “Run a new comparison” above to create one.</p></Card>
      : <ErrorBox message={error} onRetry={reload} />
    ) : data && <div className="mt-6 space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-2xl">A general AI</h2>
          {generic?.available === false
            ? <p>{generic.message?.trim() || "A general AI comparison isn't available for this story."}</p>
            : hasData(generic?.wishes) ? <CleanData value={generic?.wishes} /> : <p className="text-navy/70">No suggestions to show.</p>}
        </Card>
        <Card>
          <h2 className="mb-4 text-2xl">Genie, using Qloo</h2>
          {hasData(data.genie?.wishes) ? <CleanData value={data.genie?.wishes} /> : <p className="text-navy/70">No suggestions to show.</p>}
        </Card>
      </div>
      {hasData(data.evidence) && <Card><h2 className="mb-3 text-2xl">Evidence</h2><CleanData value={data.evidence} /></Card>}
      {data.note?.trim() && <Card>{data.note}</Card>}
      {(logRows?.length ?? 0) > 0 && <details><summary className="cursor-pointer">Qloo call log</summary><div className="mt-3"><QlooCallList rows={logRows} /></div></details>}
    </div>}
  </Page>;
}
