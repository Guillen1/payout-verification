import { Module } from "@nestjs/common";
import { BonusModule } from "../bonus/bonus.module";
import { ExtractionModule } from "../extraction/extraction.module";
import { EvalCli } from "./cli/eval.cli";

/** Measures the model's reading against the demo data's answer key. */
@Module({ imports: [ExtractionModule, BonusModule], providers: [EvalCli] })
export class EvalsModule {}
