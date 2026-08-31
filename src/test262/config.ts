import type { FilterGroup, HarnessFilters, SuitePin, Test262Baseline } from "./types.js";
import { filtersPath, pinPath } from "./paths.js";
import { readFile } from "node:fs/promises";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

const parsePin = (value: unknown): SuitePin => {
  if (!isRecord(value) || typeof value.repository !== "string" || typeof value.revision !== "string") {
    throw new Error("test262/pin.json must declare string 'repository' and 'revision' fields");
  }
  if (!/^[0-9a-f]{40}$/.test(value.revision)) {
    throw new Error(`test262/pin.json revision '${value.revision}' is not a full 40-character commit SHA`);
  }
  return { repository: value.repository, revision: value.revision };
};

const parseFilterGroup = (value: unknown, index: number): FilterGroup => {
  if (!isRecord(value) || typeof value.id !== "string" || !isStringArray(value.include) || !isStringArray(value.exclude)) {
    throw new Error(`test262/filters.json group ${index} must declare string 'id' and string-array 'include'/'exclude' fields`);
  }
  return { id: value.id, include: value.include, exclude: value.exclude };
};

const parseFilters = (value: unknown): HarnessFilters => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.groups) ||
    !isStringArray(value.unsupportedFlags) ||
    !isStringArray(value.unsupportedFeatures) ||
    !isStringArray(value.supportedIncludes)
  ) {
    throw new Error(
      "test262/filters.json must declare 'groups', 'unsupportedFlags', 'unsupportedFeatures', and 'supportedIncludes'"
    );
  }
  return {
    groups: value.groups.map(parseFilterGroup),
    unsupportedFlags: value.unsupportedFlags,
    unsupportedFeatures: value.unsupportedFeatures,
    supportedIncludes: value.supportedIncludes
  };
};

export const loadPin = async (filePath: string = pinPath): Promise<SuitePin> =>
  parsePin(JSON.parse(await readFile(filePath, "utf8")));

export const loadFilters = async (filePath: string = filtersPath): Promise<HarnessFilters> =>
  parseFilters(JSON.parse(await readFile(filePath, "utf8")));

export const loadBaseline = async (filePath: string): Promise<Test262Baseline> => {
  const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (
    !isRecord(value) ||
    typeof value.pinRevision !== "string" ||
    typeof value.minimumPass !== "number" ||
    typeof value.maximumFail !== "number" ||
    typeof value.maximumBehaviorMismatch !== "number"
  ) {
    throw new Error("Test262 baseline must declare pinRevision and numeric pass/failure thresholds");
  }
  return {
    pinRevision: value.pinRevision,
    minimumPass: value.minimumPass,
    maximumFail: value.maximumFail,
    maximumBehaviorMismatch: value.maximumBehaviorMismatch
  };
};
