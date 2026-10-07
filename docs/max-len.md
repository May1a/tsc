# Line-length enforcement

Oxlint 1.66.0 has no native `max-len` rule. Configuring `max-len` or `eslint/max-len`
fails with `Rule 'max-len' not found in plugin 'eslint'`. The installed binary's
`--rules` output confirms that the rule is absent. File decomposition does not change that.

The rule can still run through Oxlint's JavaScript plugin API. An isolated test with
`@stylistic/eslint-plugin` 5.10.0 and the repository's installed Oxlint 1.66.0 produced
these results:

- A 140-character comment passed.
- A 141-character comment failed with `stylistic(max-len)`.
- A strict scan of `src/` reported 361 violations.

The plugin was installed in a temporary directory. Repository dependencies and the
active lint configuration were unchanged. These counts include comments and string
literals, including LLVM instruction text in Emission.

## Tested configuration

This isolated configuration disables unrelated correctness rules so the scan measures
only line length. Resolve the plugin relative to the configuration file, or use its
absolute installed path.

```json
{
  "categories": { "correctness": "off" },
  "jsPlugins": [
    {
      "name": "stylistic",
      "specifier": "@stylistic/eslint-plugin"
    }
  ],
  "rules": {
    "stylistic/max-len": ["error", { "code": 140 }]
  }
}
```

To reproduce without changing repository dependencies:

```sh
investigation_dir=$(mktemp -d)
npm install --prefix "$investigation_dir" --no-audit --no-fund @stylistic/eslint-plugin@5.10.0
cat > "$investigation_dir/oxlint.json" <<'JSON'
{
  "categories": { "correctness": "off" },
  "jsPlugins": [{ "name": "stylistic", "specifier": "@stylistic/eslint-plugin" }],
  "rules": { "stylistic/max-len": ["error", { "code": 140 }] }
}
JSON
npx oxlint --config "$investigation_dir/oxlint.json" src --format json
```

## Adoption

Add the plugin as a development dependency and its rule to the existing configuration
after choosing how to handle long comments and literal text. The strict scan includes
generated LLVM instruction strings. `ignoreStrings`, `ignoreTemplateLiterals`, and
`ignoreComments` are available policy choices, but they weaken the limit.

Wrap source expressions and imports first. Keep LLVM instruction text unchanged when
splitting TypeScript expressions, then verify oracle LLVM IR hashes. Enable the rule
as an error once the chosen policy passes. Adding hundreds of suppressions would hide
the readability problem.

Oxlint documents JavaScript plugins as alpha, so pin the plugin version and verify it
when upgrading Oxlint. This approach adds a plugin dependency; it requires no Oxlint
upgrade and no second lint runner.

Sources: [Oxlint JavaScript plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
and [Stylistic max-len](https://eslint.style/rules/max-len).
