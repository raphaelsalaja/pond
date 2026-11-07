export type SyncStrategy = "cursor" | "scroll" | "full" | "none";

export interface RateProfile {
  readonly minDelayMs: number;
  readonly jitterFraction: number;
  readonly maxPerWindow: number;
  readonly windowMs: number;
  readonly firstSyncSlowdown: number;
  readonly maxPerHour: number;
  readonly maxPerDay: number;
}

export interface SourceSyncConfig {
  readonly strategy: SyncStrategy;
  readonly rate: RateProfile;
}

export type SourceSyncOverride = {
  readonly strategy?: SyncStrategy;
  readonly rate?: Partial<RateProfile>;
};

export interface SourceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly hosts: readonly string[];
  readonly urlPatterns: readonly RegExp[];
  /** Sources connect with a browser session, a public handle, or an API key. */
  readonly connect?: "session" | "handle" | "api-key";
  readonly sync?: SourceSyncOverride;
}
