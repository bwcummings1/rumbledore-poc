export type EditLedgerSource =
  | "data_correction_audit"
  | "identity_audit"
  | "league_data_edit";

export type EditLedgerClass = "audit" | "cosmetic" | "substantive";

export type EditLedgerScope = "all_years" | "this_year_only" | null;

export interface EditLedgerEntry {
  readonly actorDisplayName?: string | null;
  readonly actorUserId: string | null;
  readonly afterValue: unknown;
  readonly beforeValue: unknown;
  readonly createdAt: string;
  readonly editClass: EditLedgerClass;
  readonly field: string;
  readonly id: string;
  readonly reason: string | null;
  readonly scope: EditLedgerScope;
  readonly source: EditLedgerSource;
  readonly targetId: string | null;
  readonly targetKind: string;
}

export interface EditLedgerLeagueSummary {
  readonly id: string;
  readonly name: string;
  readonly provider: string;
  readonly providerLeagueId: string;
  readonly season: number;
}
