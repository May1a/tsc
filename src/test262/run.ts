import { pathToFileURL } from "node:url";
import { loadFilters, loadPin } from "./config.js";
import { verifyCheckout } from "./fetch.js";
import { defaultCacheDir, defaultCheckoutDir } from "./paths.js";
import { formatReport, runFilteredSuite } from "./runner.js";

const main = async (): Promise<number> => {
  const pin = await loadPin();
  const verification = await verifyCheckout(defaultCacheDir, pin.revision);
  if (verification === "missing") {
    process.stdout.write(
      `SKIP Test262 checkout not found at ${defaultCheckoutDir}; run \`npm run test262:fetch\` to download the pinned suite\n`
    );
    return 0;
  }
  if (verification === "mismatch") {
    process.stderr.write(
      `Test262 checkout at ${defaultCheckoutDir} does not match pinned revision ${pin.revision}; run \`npm run test262:fetch\` to repair it\n`
    );
    return 1;
  }
  const filters = await loadFilters();
  const run = await runFilteredSuite({ suiteRoot: defaultCheckoutDir, filters });
  process.stdout.write(formatReport(run));
  if (run.kind === "completed" && run.summary.fail > 0) {
    return 1;
  }
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
      process.stderr.write(`test262 run failed: ${message}\n`);
      process.exitCode = 1;
    });
}
