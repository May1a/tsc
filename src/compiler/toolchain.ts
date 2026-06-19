import { Command, type CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Option } from "effect";

export type ToolName = "clang" | "llvm-as" | "lli";

export type Toolchain = {
  readonly clang: Option.Option<string>;
  readonly llvmAs: Option.Option<string>;
  readonly lli: Option.Option<string>;
};

export const Toolchain = Context.GenericTag<Toolchain>("tscn/Toolchain");

const probeTool = (
  name: ToolName
): Effect.Effect<Option.Option<string>, never, CommandExecutor.CommandExecutor> => {
  const probe = Command.exitCode(Command.make(name, "--version")).pipe(
    Effect.map((exitCode) => {
      if (exitCode === 0) {
        return Option.some(name);
      }
      return Option.none<string>();
    }),
    Effect.catchAll(() => Effect.succeed(Option.none<string>()))
  );
  return probe;
};

const probeClang = (): Effect.Effect<Option.Option<string>, never, CommandExecutor.CommandExecutor> => {
  const opaquePointerProbe = "declare i32 @puts(ptr)\ndefine i32 @main() {\nentry:\n  ret i32 0\n}\n";
  return Command.exitCode(
    Command.feed(Command.make("clang", "-x", "ir", "-", "-o", "/dev/null", "-lm"), opaquePointerProbe)
  ).pipe(
    Effect.map((exitCode) => {
      if (exitCode === 0) {
        return Option.some("clang");
      }
      return Option.none<string>();
    }),
    Effect.catchAll(() => Effect.succeed(Option.none<string>()))
  );
};

let cachedToolchain: Toolchain | undefined;

const discoverToolchainUncached: Effect.Effect<Toolchain, never, CommandExecutor.CommandExecutor> = Effect.gen(
  function* discoverAllTools() {
    const [clang, llvmAs, lli] = yield* Effect.all(
      [probeClang(), probeTool("llvm-as"), probeTool("lli")],
      { concurrency: "unbounded" }
    );
    return { clang, llvmAs, lli };
  }
);

export const discoverToolchain: Effect.Effect<Toolchain, never, CommandExecutor.CommandExecutor> = Effect.gen(
  function* discoverCachedTools() {
    if (cachedToolchain !== undefined) {
      return cachedToolchain;
    }

    const toolchain = yield* discoverToolchainUncached;
    cachedToolchain = toolchain;
    return toolchain;
  }
);

export const ToolchainLive: Layer.Layer<Toolchain, never, CommandExecutor.CommandExecutor> = Layer.effect(
  Toolchain,
  discoverToolchain
);
