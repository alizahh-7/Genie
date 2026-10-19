// Shape used by the screens. If the backend differs, adapt it in api.ts (see docs/engine-contract.md).
export type Label = "told" | "likely" | "reacted" | "ai-only";
export interface Item { id: string; domain: string; name: string; tags: string[]; label: Label }
export interface Maker { name: string; type: string; city: string; remote_ok: boolean; score: number; status: string }
export interface Wish { id: string; title: string; description: string; mode: "in-person" | "remote"; makers: Maker[] }
export interface Person {
  id: string; name: string; items: Item[]; wishes: Wish[]; qlooLog: string[];
  generic: string[]; learned: string[];
  bedside: { playlist: string[]; setting: string[]; visitors: string[] };
}
