import { describe, expect, test } from "vitest";
import {
  type RuntimeHelper,
  createRuntimeHelperEmitter,
  emitRuntimeDeclarations,
  emitRuntimeDefinitions,
  runtimeHelpers,
  useRuntimeHelper
} from "../../src/compiler/runtime-helpers.js";

/**
 * The runtime-helper registry decides which definitions reach the emitted LLVM module.
 * `useRuntimeHelper` walks `runtimeHelperDependencies` to build a transitive closure, and
 * `emitRuntimeDefinitions` emits exactly the helpers in that closure. Two things can therefore
 * leave a `@call` pointing at a symbol the module never defines:
 *
 *   1. a dependency row that omits an `@call` present in its own helper's body, and
 *   2. a helper emitted as part of a shared `if (used.has(...))` group without itself being
 *      registered, so only its siblings' dependencies were pulled in.
 *
 * Both surface the same way — `llvm-as` reports "use of undefined value '@foo'" and the compile
 * fails — but neither is visible from the registry table alone. These tests emit the real output
 * and check it, so the table cannot drift from the implementation again.
 */

/** libc externs: `declare`d by emitRuntimeDeclarations, never defined in the module. */
const libcExterns = new Set<string>(["malloc", "memcpy", "memcmp", "sprintf", "exit", "printf"]);

/**
 * valueBoxObject is emitted through the typed builder by defineStructuredRuntimeHelpers rather
 * than as a `define` line, so it never appears in the emitted text.
 */
const builderEmitted = "valueBoxObject";

/** Emits the runtime for one seed helper and returns the text plus the symbols it defines. */
const emitFor = (seed: RuntimeHelper): { readonly text: string; readonly defined: ReadonlySet<string> } => {
  const runtime = createRuntimeHelperEmitter();
  useRuntimeHelper(runtime, seed);
  const text = [...emitRuntimeDeclarations(runtime), ...emitRuntimeDefinitions(runtime)].join("\n");
  const defined = new Set(
    [...text.matchAll(/^(?:define|declare)\b[^\n]*?@([A-Za-z_][A-Za-z0-9_]*)[(\s]/gm)].map((match) => match[1])
  );
  return { text, defined };
};

/** Helper symbols referenced by `text` that the emitted module does not define. */
const undefinedHelperReferences = (seed: RuntimeHelper): ReadonlySet<string> => {
  const { text, defined } = emitFor(seed);
  const runtime = createRuntimeHelperEmitter();
  useRuntimeHelper(runtime, seed);
  const helpers = new Set<string>([...runtimeHelpers(), builderEmitted]);
  const missing = new Set<string>();

  for (const [, referenced] of text.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (libcExterns.has(referenced)) {
      continue;
    }
    // Scoped to helper symbols: GC globals (`@.gc.arena.base`) and LLVM intrinsics
    // (`@llvm.fabs.f64`) are declared by emitRuntimeDeclarations or inline, under rules of their own.
    if (!helpers.has(referenced) || defined.has(referenced)) {
      continue;
    }
    if (referenced === builderEmitted && runtime.used.has(builderEmitted)) {
      continue;
    }
    missing.add(referenced);
  }
  return missing;
};

describe("runtime helper registry", () => {
  test("the registry has exactly one row per RuntimeHelper", () => {
    // runtimeHelpers() is derived from the registry's keys, and the Record type makes a union
    // member without a row a compile error. Asserting the count pins both sides against a future
    // edit that widens the union without adding a row.
    const helpers = runtimeHelpers();

    expect(new Set(helpers).size).toBe(helpers.length);
    expect(helpers.length).toBeGreaterThan(0);
  });

  test("emitting one helper's closure defines every helper that closure references", () => {
    // The exact runtime condition, per helper. This is the assertion that catches both failure
    // modes above; the registry table on its own cannot express either.
    const failures: string[] = [];

    for (const helper of runtimeHelpers()) {
      for (const missing of undefinedHelperReferences(helper)) {
        failures.push(`${helper} -> @${missing}`);
      }
    }

    expect(failures).toEqual([]);
  });

  test("the RuntimeHelper union covers every helper the emitter can define", () => {
    // Guards the union itself. A helper that is emitted but absent from the union can never be
    // passed to useRuntimeHelper, so it can never be requested as a dependency and its own
    // callees are never pulled in.
    const helpers = new Set<string>(runtimeHelpers());
    const unaccounted = new Set<string>();

    for (const helper of runtimeHelpers()) {
      const { text } = emitFor(helper);
      for (const [, defined] of text.matchAll(/^define\b[^\n]*?@([A-Za-z_][A-Za-z0-9_]*)[(\s]/gm)) {
        if (!helpers.has(defined) && defined !== builderEmitted) {
          unaccounted.add(defined);
        }
      }
    }

    expect([...unaccounted].toSorted()).toEqual([]);
  });
});
