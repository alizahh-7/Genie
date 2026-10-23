export interface Person { id: string; first_name: string; birth_year: number | null; region: string | null; language: string | null; expires_at: string }
export interface Persona { persona: number; first_name: string; birth_year: number | null; region: string | null; language: string | null }
export interface Tag { id?: string; name: string; type?: string }
export interface PortraitItem { id: string; domain: string; name: string; tags: Tag[]; source_label: string; confidence: number; resolution_level: number; matched_name: string | null }
export interface Wish { id: string; title: string; description: string; mode: string; kind: string | null; maker_type: string | null; basis: string | null; why: string | null; affinity: string | null; tags: Tag[] }
export interface Step { id: string; title: string; summary: string; qloo_calls: number | null; cached: unknown; errors: unknown }
export interface QlooRow { step: string; request: string; status: string; ms: number; label?: string }
export interface AgentLog { steps: Step[]; timings?: Record<string, number>; qloo_log?: QlooRow[] }
export interface AgentResult extends AgentLog { portrait: PortraitItem[]; wishes: Wish[]; follow_up: string | null }
export interface Fav { domain: string; name: string }
