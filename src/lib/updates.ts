/**
 * The desktop shell exposes a narrow update bridge through the preload script.
 * In a plain browser there is no bridge, and the About page says so rather than
 * pretending the fixed snapshot can refresh itself.
 */

export interface UpdateInfo {
  appVersion: string;
  lastChecked: string | null;
  addedLast: number;
  liveCount: number | null;
  error: string | null;
  autoCheck: boolean;
  archiveCount: number | null;
}

export interface AddedSong {
  id: number;
  titleEn: string;
  titleHe: string;
}

export interface UpdateCheckResult {
  added: AddedSong[];
  skipped: number;
  liveCount: number;
  baseCount: number;
  totalCount: number;
  checkedAt: string;
  source: string;
  reload: boolean;
}

export interface UpdateStatus {
  phase: "checking" | "done" | "error";
  message: string;
  added?: number;
}

export interface UpdatesApi {
  info: () => Promise<UpdateInfo>;
  check: () => Promise<UpdateCheckResult>;
  setAutoCheck: (value: boolean) => Promise<boolean>;
  onStatus?: (callback: (status: UpdateStatus) => void) => () => void;
}

export function updatesApi(): UpdatesApi | null {
  if (typeof window === "undefined") return null;
  return window.zemirot?.updates ?? null;
}

export function formatCheckedAt(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
