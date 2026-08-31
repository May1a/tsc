import type { DummyRuleMap, RuleCategories } from "oxlint";
import { defineConfig } from "oxlint";

const disabledRules: DummyRuleMap = {
    // Mix of function declarations and arrows is intentional for hoisting in the LLVM emitter.
    "func-style": "off",
    // Short names like `i`/`j`/`id` are idiomatic in loops and lowering code.
    "id-length": "off",
    // Many helpers take 3-4 args; Phase 2 will migrate to object params where it helps.
    "max-params": "off",
    // Will be enabled with auto-fix in Phase 1; kept off until the one-shot sort lands.
    "sort-imports": "off",
    // Object key order is semantic in IR descriptors (e.g. JsIrOperation unions).
    "eslint/sort-keys": "off",
    // Scoped to src/cli/** via override below; compiler core must not use console.
    // "no-console": handled in overrides — see C-7.
    // Lowering classes use static helpers without `this` by design.
    "class-methods-use-this": "off",
    // Loop emission and iterator helpers use `continue` intentionally.
    "no-continue": "off",
    // Bitwise operators are domain-meaningful (JsIrNumberOperator bitAnd/bitOr/bitXor).
    "no-bitwise": "off",
    // `i++`/`i--` are idiomatic in loops and codegen counters.
    "no-plusplus": "off",
    // `undefined` is a sentinel in the IR and value ABI.
    "no-undefined": "off",
    // Will be enabled as warn in Phase 3 after ir/llvm decomposition.
    "prefer-readonly-parameter-types": "off",
    // Spread is core to IR and runtime helpers.
    "oxc/no-rest-spread-properties": "off",
    // Low value for this team; comments already carry doc weight.
    "capitalized-comments": "off",
    // Overly restrictive for the codebase; optional chaining is used deliberately.
    "oxc/no-optional-chaining": "off",
    // Will be enabled as warn in Phase 3 after file splits make it cheap.
    "typescript/explicit-function-return-type": "off",
    // Regex literals need `/`; the rule is not useful here.
    "no-div-regex": "off",
    // Comma operator is used in for-loop increment position.
    "eslint/no-sequences": "off",
    // Effect pipelines use async at the boundary; disallowing async/await is too strict.
    "oxc/no-async-await": "off",
    // Scoped to src/cli/** via override below; only the CLI should call process.exit.
    // "unicorn/no-process-exit": handled in overrides — see C-7.
    // Lowering prefers explicit `if` for exhaustiveness over ternaries.
    "unicorn/prefer-ternary": "off",
    // Effect `Data.TaggedError` requires capitalized call without `new`.
    "eslint/new-cap": "off",
    // `void` is used intentionally for Effect discards.
    "eslint/no-void": "off",
};

const stricterRules: DummyRuleMap = {
    // Deduplicated: ban-ts-comment is configured in `rules` with minimumDescriptionLength — see C-3.
    "no-deprecated": "error",
    "unicorn/no-instanceof-array": "error",
    "unicorn/no-this-assignment": "error",
    "typescript/only-throw-error": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-member-access": "error",
    "unicorn/no-negation-in-equality-check": "error",
    "typescript/prefer-includes": "error",
    "typescript/prefer-nullish-coalescing": "error",
    "typescript/prefer-ts-expect-error": "error",
    "typescript/switch-exhaustiveness-check": [
        "error",
        {
            allowDefaultCaseForExhaustiveSwitch: true,
            considerDefaultExhaustiveForUnions: true,
        },
    ],
    "unicorn/no-typeof-undefined": "error",
    "unicorn/no-unreadable-iife": "error",
    "unicorn/no-useless-switch-case": "error",
    "unicorn/no-useless-undefined": ["error", { checkArguments: false }],
    "no-self-compare": "error",
    "typescript/consistent-type-definitions": ["error", "interface"],
    "unicorn/consistent-empty-array-spread": "error",
    "unicorn/explicit-length-check": "error",
    // Deduplicated: no-else-return is configured in the main override with allowElseIf:false — see C-3.
    "no-fallthrough": "error",
    "no-negated-condition": "error",
    "typescript/no-unsafe-return": "error",
    "unicorn/prefer-array-some": "error",
};

const categoriesEnable: RuleCategories = {
    correctness: "error",
    // C-2: nursery rules are still under development — demoted to warn so
    // oxlint upgrades don't break the build and the team doesn't learn to ignore red.
    nursery: "warn",
    perf: "error",
    restriction: "error",
    style: "error",
    suspicious: "error",
};

export default defineConfig({
    categories: categoriesEnable,
    env: {
        builtin: true,
    },
    // C-4: removed stale entries (oxlint.config.js, third_party/**, docs/**, out/**).
    // Kept: dist/** (build output), oxlint.config.ts (self), examples/** (ignored intentionally —
    // reconsider linting it in Phase 1), test/fixtures/** (golden fixtures), typescript/** (vendored),
    // vitest.config.js (config file).
    ignorePatterns: ["dist/**", "oxlint.config.ts", "examples/**", "test/fixtures/**", "typescript/**", "vitest.config.js"],
    overrides: [
        {
            env: {
                node: true,
            },
            files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
            rules: {
                ...disabledRules,
                ...stricterRules,
                "constructor-super": "error",
                curly: ["error", "multi-line"],
                eqeqeq: ["error", "always"],
                // C-5: cap at 30 statements per function. Phase 2 will tighten to 20 once
                // ir.ts / llvm.ts / runtime-helpers.ts are decomposed and the 89
                // eslint-disable suppressions are removed.
                "max-statements": ["error", { max: 30 }],
                // C-3: single source of truth for no-else-return (was duplicated in stricterRules).
                "no-else-return": [
                    "error",
                    {
                        allowElseIf: false,
                    },
                ],
                "no-use-before-define": [
                    "error",
                    {
                        classes: false,
                        functions: false,
                        variables: true,
                    },
                ],
                // C-6: file-size guard — warn at 800 LOC (skip blanks/comments). The three
                // god-files (ir.ts 12K, runtime-helpers.ts 11K, llvm.ts 8.5K) will warn until
                // Phase 2 decomposition; warn (not error) keeps the build green while
                // making the debt visible.
                "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
                "max-lines-per-function": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
            },
        },
        // C-7: only the CLI boundary should use console / process.exit. Compiler core
        // and test helpers are covered by the restriction category (error) via the main override.
        {
            files: ["src/cli/**/*.{ts,mts,cts,js,mjs,cjs}"],
            rules: {
                "no-console": "off",
                "unicorn/no-process-exit": "off",
            },
        },
        {
            files: ["test/**/*.ts"],
            rules: {
                "typescript/no-unsafe-assignment": "off",
                "typescript/no-unsafe-member-access": "off",
                "typescript/no-unsafe-return": "off",
                "typescript/no-unsafe-type-assertion": "off",
                // Test fixtures and integration suites are large by nature; size guards are for src/**.
                "max-lines": "off",
                "max-lines-per-function": "off",
            },
        },
    ],
    plugins: ["typescript", "eslint", "unicorn", "oxc"],
    rules: {
        "@typescript-eslint/ban-ts-comment": [
            "error",
            {
                minimumDescriptionLength: 120,
            },
        ],
        "@typescript-eslint/consistent-indexed-object-style": [
            "error",
            "record",
        ],
        "@typescript-eslint/restrict-plus-operands": [
            "error",
            {
                allowAny: false,
                allowBoolean: false,
                allowNullish: false,
                allowNumberAndString: false,
                allowRegExp: false,
            },
        ],
        "@typescript-eslint/restrict-template-expressions": [
            "error",
            {
                allowAny: false,
                allowBoolean: false,
                allowNever: false,
                allowNullish: false,
                allowNumber: true,
                allowRegExp: false,
            },
        ],
        "@typescript-eslint/return-await": [
            "error",
            "error-handling-correctness-only",
        ],
        "eslint/no-magic-numbers": [
            "error",
            {
                ignoreEnums: true,
                ignoreDefaultValues: true,
                ignoreNumericLiteralTypes: true,
                ignoreReadonlyClassProperties: true,
                ignoreTypeIndexes: true,
                ignoreClassFieldInitialValues: true,
                ignoreArrayIndexes: true,
                ignore: [0, 1, 2, -1],
            },
        ],
    },
    settings: {
        "jsx-a11y": {
            attributes: {},
            components: {},
        },
        next: {
            rootDir: [],
        },
        react: {
            componentWrapperFunctions: [],
            formComponents: [],
            linkComponents: [],
        },
        vitest: {
            typecheck: false,
        },
    },
});
