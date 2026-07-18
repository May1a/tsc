export type SuitePin = {
  readonly repository: string;
  readonly revision: string;
};

export type FilterGroup = {
  readonly id: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
};

export type HarnessFilters = {
  readonly groups: readonly FilterGroup[];
  readonly unsupportedFlags: readonly string[];
  readonly unsupportedFeatures: readonly string[];
  readonly supportedIncludes: readonly string[];
};

export type Test262Frontmatter = {
  readonly flags: readonly string[];
  readonly includes: readonly string[];
  readonly features: readonly string[];
  readonly negative?: {
    readonly phase: string;
    readonly type: string;
  };
};

export type Expectation =
  | { readonly kind: "positive" }
  | { readonly kind: "negative-compile" }
  | { readonly kind: "negative-runtime"; readonly errorName: string };

export type ParseGoal = "script" | "module";

export type SelectedTest = {
  readonly id: string;
  readonly filePath: string;
  readonly source: string;
  readonly expectation: Expectation;
  readonly parseGoal: ParseGoal;
};

export type Classification = "pass" | "fail" | "skip" | "coverage-gap";

export type TestCaseResult = {
  readonly id: string;
  readonly classification: Classification;
  readonly reason?: string;
  readonly detail?: string;
  readonly artifactsDir?: string;
};

export type SuiteSummary = {
  readonly total: number;
  readonly selected: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly coverageGap: number;
  readonly skipReasons: Readonly<Record<string, number>>;
  readonly failReasons: Readonly<Record<string, number>>;
};

export type TestFamilySummary = {
  readonly family: string;
  readonly total: number;
  readonly pass: number;
  readonly fail: number;
  readonly skip: number;
  readonly coverageGap: number;
};

export type Test262MachineReport = {
  readonly pinRevision: string;
  readonly nodeVersion: string;
  readonly selected: number;
  readonly summary: SuiteSummary;
  readonly families: readonly TestFamilySummary[];
};

export type Test262Baseline = {
  readonly pinRevision: string;
  readonly minimumPass: number;
  readonly maximumFail: number;
  readonly maximumBehaviorMismatch: number;
};

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
