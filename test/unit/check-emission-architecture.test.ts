import { describe, expect, test } from "vitest";
import { scanEmissionArchitecture } from "../../scripts/check-emission-architecture.mjs";

describe("Emission architecture", () => {
  test.each([
    `const instruction = \`  \${value} = call i64 @valuePropertyGet(i64 \${receiver})\`;`,
    'const instruction = "  %slot = alloca i64";',
    `const instruction = \`  store i64 \${value}, ptr \${slot}\`;`,
    `const instruction = \`  br i1 \${condition}, label %then, label %else\`;`,
    'const instruction = "define i32 @main() {";',
    'const instruction = "  %test = icmp eq i64 %value, 0";',
    'const instruction = "  %value = zext i8 %byte to i64";',
    'const instruction = "  %index = add nsw i64 %previous, 1";',
    'const instruction = "@cell = internal global i64 0";',
    `const instruction = \`  store \${type} \${value}, ptr \${slot}\`;`,
    `const instruction = \`  \${result} = call \${type} @\${name}()\`;`,
    `const instruction = \`@\${name} = internal global \${type} \${initial}\``,
  ])("rejects raw instructions from the old backend: %s", (source) => {
    expect(scanEmissionArchitecture("emitter.ts", source).map((finding) => finding.rule)).toEqual(["no-raw-llvm-in-emission"]);
  });

  test("rejects dynamic text injection through the legacy module API", () => {
    expect(scanEmissionArchitecture("emitter.ts", 'module.addLegacyModuleText({ origin: "backend", text });')
      .map((finding) => finding.rule)).toEqual(["no-dynamic-legacy-llvm"]);
  });

  test.each([
    "context.numIndex += 1;",
    "context.exceptionTarget = catchLabel;",
    "context.bindings.set(name, binding);",
    "context.cleanupStack.push(frame);",
    "renamedContext.bindings.set(name, binding);",
    "scope.state.loopLabels.push(labels);",
    "context.stringConstants.push(text);"
  ])("rejects directly managed context state: %s", (source) => {
    expect(scanEmissionArchitecture("emitter.ts", source).map((finding) => finding.rule)).toEqual(["no-context-field-mutation"]);
  });

  test("allows typed construction and capability calls", () => {
    expect(scanEmissionArchitecture("emitter.ts", [
      "const value = block.load(llvm.i64, storage.pointer, names.next());",
      "scope.withExceptionTarget(target, () => lower(body));",
      "moduleConstants.internString(text);",
      "this.#bindings.set(bindingId, storage);"
    ].join("\n"))).toEqual([]);
  });

  test("permits readonly constructor initialization but rejects later context writes", () => {
    expect(scanEmissionArchitecture("emitter.ts", [
      "class Owner { readonly bindings: BindingReads; constructor(bindings: BindingReads) { this.bindings = bindings; } }",
      "context.bindings = replacement;"
    ].join("\n")).map((finding) => finding.rule)).toEqual(["no-context-field-mutation"]);
  });

  test.each([
    "export interface EmitContext { readonly bindings: Map<string, Binding>; }",
    "export interface ModuleCapability { readonly constants: string[]; }",
    "export class NativeFunction { readonly blocks: Block[] = []; }",
    "class FunctionOwner { index = 0; }",
    "export interface CompletionCapability { target: string; }",
    "class FunctionOwner { constructor(public readonly bindings: Map<Id, Storage>) {} }"
  ])("rejects publicly mutable owner state: %s", (source) => {
    expect(scanEmissionArchitecture("emitter.ts", source).map((finding) => finding.rule)).toEqual(["no-exposed-emission-state"]);
  });

  test.each([
    "export interface Bindings { readonly bindings: ReadonlyMap<BindingId, Storage>; }",
    "export class FunctionOwner { readonly #blocks: Block[] = []; }",
    "class FunctionOwner { private index = 0; }",
    "export interface Blocks { readonly blocks: readonly Block[]; }",
    "class FunctionOwner { constructor(private readonly bindings: Map<Id, Storage>) {} }"
  ])("allows private owner state and readonly views: %s", (source) => {
    expect(scanEmissionArchitecture("emitter.ts", source)).toEqual([]);
  });
});
