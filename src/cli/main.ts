#!/usr/bin/env node

import { CliConfig, Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { DiagnosticsLive } from "../compiler/diagnostics-service.js";
import { ToolchainLive } from "../compiler/toolchain.js";
import { tscnCommand } from "./run.js";

const cli = Command.run(tscnCommand, {
  name: "tscn",
  version: "0.0.0"
});

const cliLayer = Layer.provideMerge(
  Layer.provideMerge(
    Layer.provideMerge(ToolchainLive, NodeContext.layer),
    DiagnosticsLive
  ),
  CliConfig.defaultLayer
);

NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(cliLayer)), {
  disableErrorReporting: true
});
