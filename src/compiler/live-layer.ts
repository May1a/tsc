import { NodeContext } from "@effect/platform-node";
import { Layer } from "effect";
import { ToolchainLive } from "./toolchain.js";

/**
 * The live layer every compile entry point needs: the discovered toolchain plus the Node
 * filesystem, path and process implementations.
 *
 * This was previously written out by hand in three places (`src/cli/main.ts`,
 * `src/test262/execute.ts` and `test/integration/helpers.ts`) as a nested `Layer.provideMerge`
 * chain, and the test262 and integration copies had already drifted from the CLI's by carrying
 * `DiagnosticsLive`. One definition means an added requirement is a one-line change here rather
 * than three edits that can be missed.
 */
export const compilerLiveLayer = Layer.provideMerge(ToolchainLive, NodeContext.layer);
