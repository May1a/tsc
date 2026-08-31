import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPin } from "./config.js";
import { defaultCacheDir } from "./paths.js";
import { captureProcessWithTimeout } from "./process.js";
import type { SuitePin } from "./types.js";

export class FetchError extends Error {
  public override readonly name = "FetchError";
}

const gitTimeoutMs = 600_000;
const gitEnv = { GIT_TERMINAL_PROMPT: "0" };

const git = async (args: readonly string[], timeoutMs: number = gitTimeoutMs) =>
  captureProcessWithTimeout("git", args, { env: gitEnv, timeoutMs });

const gitOrFail = async (args: readonly string[], timeoutMs?: number): Promise<string> => {
  const run = await git(args, timeoutMs);
  if (run.status !== 0) {
    throw new FetchError(`git ${args.join(" ")} failed (${run.status}): ${run.stderr.trim()}`);
  }
  return run.stdout.trim();
};

const readCheckedOutRevision = async (checkoutDir: string): Promise<string | undefined> => {
  const run = await git(["-C", checkoutDir, "rev-parse", "HEAD"]);
  if (run.status !== 0) {
    return undefined;
  }
  return run.stdout.trim();
};

export type CheckoutVerification = "missing" | "mismatch" | "ok";

export const verifyCheckout = async (cacheDir: string, revision: string): Promise<CheckoutVerification> => {
  const checkedOut = await readCheckedOutRevision(path.join(cacheDir, "checkout"));
  if (checkedOut === undefined) {
    return "missing";
  }
  if (checkedOut === revision) {
    return "ok";
  }
  return "mismatch";
};

export interface FetchOutcome {
  readonly status: "already-present" | "fetched";
  readonly revision: string;
  readonly checkoutDir: string;
}

/**
 * Resolves the pinned Test262 revision into `cacheDir/checkout` and verifies
 * the checkout matches the pin. Repeated runs after a successful fetch are a
 * no-op. A stale or corrupted cache is re-fetched, and any checkout that
 * still does not match the pin after fetching is a hard error.
 */
export const ensureSuiteFetched = async (pin: SuitePin, cacheDir: string): Promise<FetchOutcome> => {
  const checkoutDir = path.join(cacheDir, "checkout");
  const existing = await readCheckedOutRevision(checkoutDir);
  if (existing === pin.revision) {
    return { status: "already-present", revision: pin.revision, checkoutDir };
  }
  await rm(checkoutDir, { recursive: true, force: true });
  await gitOrFail(["init", "-q", "-b", "main", checkoutDir]);
  await gitOrFail(["-C", checkoutDir, "remote", "add", "origin", pin.repository]);
  await gitOrFail(["-C", checkoutDir, "fetch", "--depth", "1", "origin", pin.revision]);
  await gitOrFail(["-C", checkoutDir, "checkout", "-q", "--detach", "FETCH_HEAD"]);
  const checkedOut = await readCheckedOutRevision(checkoutDir);
  if (checkedOut !== pin.revision) {
    throw new FetchError(
      `Test262 checkout revision '${checkedOut ?? "unknown"}' does not match pinned revision '${pin.revision}'`
    );
  }
  return { status: "fetched", revision: pin.revision, checkoutDir };
};

const main = async (): Promise<number> => {
  const pin = await loadPin();
  const outcome = await ensureSuiteFetched(pin, defaultCacheDir);
  let message: string;
  if (outcome.status === "already-present") {
    message = `Test262 ${outcome.revision} already present at ${outcome.checkoutDir}`;
  } else {
    message = `Fetched Test262 ${outcome.revision} into ${outcome.checkoutDir}`;
  }
  process.stdout.write(`${message}\n`);
  return 0;
};

const entryPoint = process.argv.at(1);
const isMainModule = entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href;

if (isMainModule) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      let message: string;
      if (error instanceof Error) {
        ({ message } = error);
      } else {
        message = String(error);
      }
      process.stderr.write(`test262 fetch failed: ${message}\n`);
      process.exitCode = 1;
    });
}
