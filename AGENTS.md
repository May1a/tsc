# tsc - Native TypeScript Compiler

Use the `unslop` skill always.

This is a typescript compiler, it is supposed to compile typescript to native code by generating LLVM IR.

Code Quality must be of a very high priority. Shortcuts must be avoided.
If there is a problem with code quality suggest new lints.

## Commands

- Run the linter with `npm run lint`.
- Run typechecking with `npm run check`.
- Run Vitest tests with `npm test`.
- Fetch the pinned Test262 checkout with `npm run test262:fetch`.
- Run the filtered Test262 suite with `npm run test262:run`; it skips when the checkout has not been fetched.
