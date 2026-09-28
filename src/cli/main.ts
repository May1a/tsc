#!/usr/bin/env node

import { CliConfig, Command } from "@effect/cli";
import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { readFileSync } from "node:fs";
import { compilerLiveLayer } from "../compiler/live-layer.js";
import { tscnCommand } from "./run.js";

const packageMetadata: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
let packageVersion = "0.0.0";
if (typeof packageMetadata === "object" && packageMetadata !== null && "version" in packageMetadata) {
  const { version } = packageMetadata;
  if (typeof version === "string") {
    packageVersion = version;
  }
}

const cli = Command.run(tscnCommand, {
  name: "tscn",
  version: packageVersion
});

const normalizeArgv = (argv: readonly string[]): string[] =>
  argv.map((arg) => {
    if (arg === "-fcpp") {
      return "--fcpp";
    }
    return arg;
  });

const cliLayer = Layer.provideMerge(compilerLiveLayer, CliConfig.defaultLayer);

NodeRuntime.runMain(cli(normalizeArgv(process.argv)).pipe(Effect.provide(cliLayer)), {
  disableErrorReporting: true
});
