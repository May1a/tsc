import { Command, type CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Option } from "effect";
import { devNull } from "node:os";

export type ToolName = "clang" | "clang++" | "llvm-as" | "lli";

export type Toolchain = {
  readonly clang: Option.Option<string>;
  readonly clangxx: Option.Option<string>;
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
    Command.feed(Command.make("clang", "-x", "ir", "-", "-o", devNull, "-lm"), opaquePointerProbe)
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

const probeClangxx = (): Effect.Effect<Option.Option<string>, never, CommandExecutor.CommandExecutor> => {
  const llvmIrProbe = "define i32 @main() {\nentry:\n  ret i32 0\n}\n";
  return Command.exitCode(
    Command.feed(Command.make("clang++", "-std=c++20", "-x", "ir", "-", "-x", "c++", devNull, "-o", devNull, "-lm"), llvmIrProbe)
  ).pipe(
    Effect.map((exitCode) => {
      if (exitCode === 0) {
        return Option.some("clang++");
      }
      return Option.none<string>();
    }),
    Effect.catchAll(() => Effect.succeed(Option.none<string>()))
  );
};

let cachedToolchain: Toolchain | undefined;

const discoverToolchainUncached: Effect.Effect<Toolchain, never, CommandExecutor.CommandExecutor> = Effect.gen(
  function* discoverAllTools() {
    const [clang, clangxx, llvmAs, lli] = yield* Effect.all(
      [probeClang(), probeClangxx(), probeTool("llvm-as"), probeTool("lli")],
      { concurrency: "unbounded" }
    );
    return { clang, clangxx, llvmAs, lli };
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
