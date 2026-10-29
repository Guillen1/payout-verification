import "reflect-metadata";
import { CommandFactory } from "nest-commander";
import { AppModule } from "./app.module";

/** The command line: `seed`, `reconcile` and `eval`. Run with --help for options. */
async function bootstrap(): Promise<void> {
  await CommandFactory.run(AppModule, {
    logger: ["warn", "error"],
    // A command that throws must fail the process, so CI and scripts see it.
    serviceErrorHandler: error => {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
  });
}

void bootstrap();
