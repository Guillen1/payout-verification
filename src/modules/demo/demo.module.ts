import { Module } from "@nestjs/common";
import { SeedCli } from "./cli/seed.cli";

/** Synthetic demo data: an invented policy book, carrier statements and their answer key. */
@Module({ providers: [SeedCli] })
export class DemoModule {}
