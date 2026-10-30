import { Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { AppPaths } from "../../../libs/app-paths/app-paths";
import { BonusRunsService, UnknownProgramError } from "../application/services/bonus-runs.service";
import type { BonusView } from "../application/views/bonus-view";

@Controller("bonus")
export class BonusController {
  constructor(
    private readonly paths: AppPaths,
    private readonly bonusRuns: BonusRunsService
  ) {}

  @Get()
  list() {
    return this.bonusRuns.programs(this.paths);
  }

  @Get(":programId")
  async view(@Param("programId") programId: string): Promise<BonusView> {
    const view = await notFoundIfUnknown(this.bonusRuns.view(this.paths, programId));
    if (view === null) throw new NotFoundException(`Program ${programId} has not been run yet.`);
    return view;
  }

  @Post(":programId/runs")
  async run(@Param("programId") programId: string): Promise<BonusView> {
    await notFoundIfUnknown(this.bonusRuns.run(this.paths, programId));
    return this.view(programId);
  }

  @Get(":programId/dispute-letter")
  async disputeLetter(@Param("programId") programId: string) {
    const markdown = await notFoundIfUnknown(this.bonusRuns.disputeLetter(this.paths, programId));
    if (markdown === null) throw new NotFoundException(`No dispute letter for ${programId}.`);
    return { markdown };
  }
}

async function notFoundIfUnknown<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof UnknownProgramError) throw new NotFoundException(error.message);
    throw error;
  }
}
