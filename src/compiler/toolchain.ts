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

export const discoverToolchain: Effect.Effect<Toolchain, never, CommandExecutor.CommandExecutor> = Effect.gen(
  function* discoverAllTools() {
    const [clang, llvmAs, lli] = yield* Effect.all(
      [probeTool("clang"), probeTool("llvm-as"), probeTool("lli")],
      { concurrency: "unbounded" }
    );
    return { clang, llvmAs, lli };
  }
);

export const ToolchainLive: Layer.Layer<Toolchain, never, CommandExecutor.CommandExecutor> = Layer.effect(
  Toolchain,
  discoverToolchain
);
