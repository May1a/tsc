export interface SuitePin {
  readonly repository: string;
  readonly revision: string;
}

export interface FilterGroup {
  readonly id: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export interface HarnessFilters {
  readonly groups: readonly FilterGroup[];
  readonly unsupportedFlags: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly supportedIncludes: readonly string[];
}

export interface Test262Frontmatter {
  readonly flags: readonly string[];
  readonly includes: readonly string[];
  readonly features: readonly string[];
  readonly negative?: {
    readonly phase: string;
    readonly type: string;
  };
}

export type Expectation =
  | { readonly kind: "positive" }
  | { readonly kind: "negative-compile" }
  | { readonly kind: "negative-runtime"; readonly errorName: string };

// Per-spec parse goal, kept as forward plumbing for a future
// module-compilation slice (docs/plan/test262-script-module-oracle.md, design
// decision 1). Under the shipped test262/filters.json the "module" flag stays
// unsupported, so selected tests are always "script" today.
export type ParseGoal = "script" | "module";

export interface SelectedTest {
  readonly id: string;
  readonly filePath: string;
  readonly source: string;
  readonly expectation: Expectation;
  readonly parseGoal: ParseGoal;
}

export type Classification = "pass" | "fail" | "skip" | "coverage-gap";

export interface TestCaseResult {
  readonly id: string;
  readonly classification: Classification;
  readonly reason?: string;
  readonly detail?: string;
  readonly artifactsDir?: string;
}

export interface SuiteSummary {
  readonly total: number;
  readonly selected: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly coverageGap: number;
  readonly skipReasons: Readonly<Record<string, number>>;
  readonly failReasons: Readonly<Record<string, number>>;
}

export interface TestFamilySummary {
  readonly family: string;
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly coverageGap: number;
}

export interface Test262MachineReport {
  readonly pinRevision: string;
  readonly nodeVersion: string;
  readonly selected: number;
  readonly summary: SuiteSummary;
  readonly families: readonly TestFamilySummary[];
}

export interface Test262Baseline {
  readonly pinRevision: string;
  readonly minimumPass: number;
  readonly maximumFail: number;
  readonly maximumBehaviorMismatch: number;
}

export type SuiteRun =
  | {
      readonly kind: "missing-checkout";
      readonly message: string;
    }
  | {
      readonly kind: "completed";
      readonly results: readonly TestCaseResult[];
      readonly summary: SuiteSummary;
    };
