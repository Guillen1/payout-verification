import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { AppPaths } from "../../../libs/app-paths/app-paths";
import { ApprovalError, ApprovalsService, type PendingApproval } from "../application/approvals.service";

const ApproveBody = z.object({ approvedBy: z.string().trim().min(1).max(80) });

@Controller("approvals")
export class ApprovalsController {
  constructor(
    private readonly paths: AppPaths,
    private readonly approvals: ApprovalsService
  ) {}

  @Get()
  pending(): Promise<PendingApproval[]> {
    return this.approvals.pending(this.paths);
  }

  /** The admin has no logins: the reviewer types their name, and it is recorded with the approval. */
  @Post(":id")
  async approve(@Param("id") id: string, @Body() body: unknown) {
    const parsed = ApproveBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Say who is approving: approvedBy, up to 80 characters.");
    try {
      return await this.approvals.approve(this.paths, id, parsed.data.approvedBy);
    } catch (error) {
      if (error instanceof ApprovalError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
