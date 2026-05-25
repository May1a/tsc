# Define JavaScript-Compatible Native TypeScript

This project targets TypeScript programs compiled to native executables while preserving JavaScript-compatible runtime behavior for the supported language. We permanently exclude `eval` and `with` because they undermine static analysis, lexical scope reasoning, and native compilation boundaries; this means the project should not be described as implementing full JavaScript semantics.
