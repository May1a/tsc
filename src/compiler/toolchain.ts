import { Command, type CommandExecutor } from "@effect/platform";
import { Context, Effect, Layer, Option } from "effect";
import { devNull } from "node:os";
import process from "node:process";

export type ToolName = "clang" | "clang++" | "llvm-as" | "lli";

const thirtyTwoBitWord = 32;
const sixtyFourBitWord = 64;
const jsValuePointerAddressBits = 48;

export type TargetArchitecture = "x86_64" | "aarch64" | "x86" | "arm" | "unknown";

export interface TargetFacts {
  readonly triple: string;
  readonly architecture: TargetArchitecture;
  readonly pointerWidthBits: number | undefined;
  readonly doubleFormat: "ieee754-binary64" | "other" | "unknown";
  readonly pointerAddressBits: number | undefined;
}

export interface Toolchain {
  readonly clang: Option.Option<string>;
  readonly clangxx: Option.Option<string>;
  readonly llvmAs: Option.Option<string>;
  readonly lli: Option.Option<string>;
  readonly target: TargetFacts;
}

export const Toolchain = Context.GenericTag<Toolchain>("tscn/Toolchain");

export function normalizeHostTargetFacts(
  architecture: NodeJS.Architecture,
  platform: NodeJS.Platform
): TargetFacts {
  let normalizedArchitecture: TargetArchitecture = "unknown";
  let pointerWidthBits: number | undefined;
  if (architecture === "x64") {
    normalizedArchitecture = "x86_64";
    pointerWidthBits = sixtyFourBitWord;
  } else if (architecture === "arm64") {
    normalizedArchitecture = "aarch64";
    pointerWidthBits = sixtyFourBitWord;
  } else if (architecture === "ia32") {
    normalizedArchitecture = "x86";
    pointerWidthBits = thirtyTwoBitWord;
  } else if (architecture === "arm") {
    normalizedArchitecture = "arm";
    pointerWidthBits = thirtyTwoBitWord;
  }
  let pointerAddressBits: number | undefined;
  // This records the active host ABI's default-allocation guarantee, not the CPU's
  // maximum virtual-address width. These x86-64 OS ABIs keep ordinary image,
  // stack, and allocator mappings in the low canonical 48-bit range; Linux also
  // does so on five-level paging unless a caller explicitly requests a high hint.
  // The compiler runtime and inline extension allocator never request such hints.
  if (normalizedArchitecture === "x86_64" && (platform === "linux" || platform === "darwin" || platform === "win32")) {
    pointerAddressBits = jsValuePointerAddressBits;
  }
  return {
    triple: `${normalizedArchitecture}-${platform}`,
    architecture: normalizedArchitecture,
    pointerWidthBits,
    doubleFormat: "ieee754-binary64",
    pointerAddressBits
  };
}

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
    return { clang, clangxx, llvmAs, lli, target: normalizeHostTargetFacts(process.arch, process.platform) };
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
