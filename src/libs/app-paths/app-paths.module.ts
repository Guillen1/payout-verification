import { Module } from "@nestjs/common";
import { AppPaths, appPathsProvider } from "./app-paths";

@Module({ providers: [appPathsProvider], exports: [AppPaths] })
export class AppPathsModule {}
