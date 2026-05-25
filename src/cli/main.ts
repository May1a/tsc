#!/usr/bin/env node

import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { runCli } from "./run.js";

NodeRuntime.runMain(runCli(process.argv.slice(2)).pipe(Effect.provide(NodeContext.layer)));
