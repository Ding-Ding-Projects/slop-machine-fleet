export type WorkerAction =
  | "start"
  | "stop"
  | "restart"
  | "repair"
  | "update"
  | "drain"
  | "terminate";
export interface LaunchSpec {
  count: number;
  region: string;
  instanceType: string;
  subnetId: string;
  securityGroupId: string;
  instanceProfile: string;
  bootGiB: number;
  dataGiB: number;
}
export interface Worker {
  id: string;
  instanceId?: string;
  dataVolumeId?: string;
  name: string;
  region: string;
  state: string;
  transport: "unenrolled" | "ready";
  createdAt: string;
}
export interface Task {
  id: string;
  workerId: string;
  repository: string;
  prompt: string;
  model?: string;
  state:
    | "queued"
    | "dispatching"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  createdAt: string;
  result?: unknown;
}
export interface Operation {
  id: string;
  action: string;
  state: string;
  targets: Array<{ id: string; state: string; message?: string }>;
  createdAt: string;
}
export interface CostEstimate {
  available: boolean;
  currency: "USD";
  hourly?: number;
  monthly?: number;
  source: string;
  retrievedAt: string;
  exclusions: string[];
  reason?: string;
}
export interface LaunchReview {
  id: string;
  spec: LaunchSpec;
  specificationHash: string;
  expiresAt: string;
  estimate: CostEstimate;
}
export interface AuthStatus {
  authenticated: boolean;
  setupAvailable: boolean;
  csrfToken?: string;
}
export interface ApiError {
  error: { code: string; message: string };
}
export interface FleetSettings {
  region: string;
  maxWorkers: number;
  theme: "system" | "light" | "dark";
  language: "en" | "yue" | "bilingual";
  soundEnabled: boolean;
}
export interface TaskInput {
  workerId: string;
  repository: string;
  prompt: string;
  model?: string;
}
export interface FleetEvent {
  sequence: number;
  type: string;
  data: unknown;
  createdAt: string;
}
export type TaskOutputKind =
  | "assistant"
  | "command"
  | "command-output"
  | "file-change"
  | "progress"
  | "state"
  | "result";
export interface TaskOutputEvent {
  sequence: number;
  kind: TaskOutputKind;
  content: string;
  at: string;
  itemId?: string | null;
  stream?: "combined" | "stdout" | "stderr" | null;
  truncated: boolean;
  redacted: boolean;
}
export interface TaskOutputPage {
  taskId: string;
  events: TaskOutputEvent[];
  nextCursor: number;
  oldestSequence: number;
  latestSequence: number;
  gap: boolean;
  truncated: boolean;
  resetReason?: string | null;
}
