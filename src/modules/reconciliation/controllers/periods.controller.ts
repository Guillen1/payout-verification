import { BadRequestException, Controller, Get, NotFoundException, Param, Post, StreamableFile } from "@nestjs/common";
import { AppPaths } from "../../../libs/app-paths/app-paths";
import { PeriodRunsService } from "../application/services/period-runs.service";
import type { PeriodView } from "../application/views/period-view";
import { isPeriod } from "../domain/dates";

@Controller("periods")
export class PeriodsController {
  constructor(
    private readonly paths: AppPaths,
    private readonly periodRuns: PeriodRunsService
  ) {}

  @Get()
  list() {
    return this.periodRuns.periods(this.paths);
  }

  @Get(":period")
  async view(@Param("period") period: string): Promise<PeriodView> {
    const view = await this.periodRuns.view(this.paths, checked(period));
    if (view === null) throw new NotFoundException(`Period ${period} has not been reconciled yet.`);
    return view;
  }

  @Post(":period/runs")
  async run(@Param("period") period: string): Promise<PeriodView> {
    await this.periodRuns.run(this.paths, checked(period));
    return this.view(period);
  }

  /** The carrier's statement as it arrived, so a person can see the line the finding is about. */
  @Get(":period/statements/:carrierId")
  async statement(@Param("period") period: string, @Param("carrierId") carrierId: string): Promise<StreamableFile> {
    const file = await this.periodRuns.statementFile(this.paths, checked(period), carrierId);
    if (file === null) throw new NotFoundException(`No statement from ${carrierId} in ${period}.`);
    return new StreamableFile(file.content, {
      type: file.kind === "pdf" ? "application/pdf" : "text/csv; charset=utf-8"
    });
  }

  @Get(":period/disputes/:carrierId")
  async disputeLetter(@Param("period") period: string, @Param("carrierId") carrierId: string) {
    const markdown = await this.periodRuns.disputeLetter(this.paths, checked(period), carrierId);
    if (markdown === null) throw new NotFoundException(`No dispute letter for ${carrierId} in ${period}.`);
    return { markdown };
  }
}

function checked(period: string): string {
  if (!isPeriod(period)) throw new BadRequestException(`A period looks like 2026-09, not "${period}".`);
  return period;
}
