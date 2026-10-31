/**
 * Generative-UI contract for the AMAN Copilot. The server streams these events; the client renders
 * each `component` as a live card. Components carry data resolved on the server from stored records
 * — the model only chooses *which* evidence to show and writes short explanations.
 */

export type CopilotMode = "llm" | "rules";
export type Tone = "done" | "attention" | "help" | "pending" | "blocked";
export type CheckStatus = "pending" | "pass" | "fail";

export interface GraphRow {
  id: string;
  label: string;
  detail?: string;
  tags: { text: string; tone?: "teal" | "coral" | "amber" | "neutral" }[];
  meta?: string;
  tone: Tone;
  emphasized?: boolean;
}

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface ActionItem {
  kind:
    | "activate_incident"
    | "prepare_guidance"
    | "approve_guidance"
    | "issue_alerts"
    | "open_case"
    | "open_recipient"
    | "open_guidance"
    | "open_responses"
    | "fly_zone"
    | "fly_closure";
  target: string;
  label: string;
  allowed: boolean;
  reason?: string;
}

export interface OverviewProps {
  title: string;
  incidentId: string;
  state: string;
  stateTone: Tone;
  headline: string;
  rows: GraphRow[];
  checks: CheckItem[];
  next: { label: string; tone: Tone; action: ActionItem | null };
}

export interface CaseRow {
  caseId: string;
  priority: "P1" | "P2";
  status: string;
  displayName: string;
  recipientId: string;
  area: string;
  openedAt: string;
  need: string;
  summary: string;
  original: string;
  summaryBy: CopilotMode;
}

export interface CasesProps {
  title: string;
  items: CaseRow[];
  totals: { open: number; p1: number; awaiting: number };
}

export interface TraceProps {
  recipientId: string;
  displayName: string;
  language: string;
  rows: GraphRow[];
  explanation: string;
  location: [number, number] | null;
}

export interface GuidanceSide {
  headline: string;
  body: string;
  steps: string[];
  facts: string[];
}

export interface GuidanceProps {
  actionId: string;
  variant: string;
  recipients: number;
  en: GuidanceSide;
  ar: GuidanceSide;
  mode: string;
}

export interface ChecksProps {
  title: string;
  items: CheckItem[];
}

export interface ActionsProps {
  items: ActionItem[];
}

export type ComponentKind = "overview" | "cases" | "trace" | "guidance" | "checks" | "actions";

export type ComponentProps =
  | { kind: "overview"; props: OverviewProps }
  | { kind: "cases"; props: CasesProps }
  | { kind: "trace"; props: TraceProps }
  | { kind: "guidance"; props: GuidanceProps }
  | { kind: "checks"; props: ChecksProps }
  | { kind: "actions"; props: ActionsProps };

export type CopilotEvent =
  | { t: "meta"; mode: CopilotMode; model: string | null; label: string; note?: string }
  | { t: "step"; id: string; text: string; state: "running" | "done" | "failed" }
  | { t: "thinking"; delta: string }
  | { t: "thinking_done"; ms: number }
  | { t: "text"; delta: string }
  | { t: "component_start"; id: string; kind: ComponentKind; label: string }
  | ({ t: "component"; id: string } & ComponentProps)
  | { t: "check"; id: string; checkId: string; status: CheckStatus; detail?: string }
  | { t: "component_dropped"; id: string; reason: string }
  | { t: "done"; ms: number; mode: CopilotMode }
  | { t: "error"; message: string };
