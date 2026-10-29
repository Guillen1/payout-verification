import { Module } from "@nestjs/common";
import { ExtractionModule } from "../extraction/extraction.module";
import { EvalCli } from "./cli/eval.cli";

/** Measures the model's reading against the demo data's answer key. */
@Module({ imports: [ExtractionModule], providers: [EvalCli] })
export class EvalsModule {}
