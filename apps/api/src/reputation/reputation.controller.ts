import { Controller, Get, Param } from "@nestjs/common";
import { ReputationService } from "./reputation.service";

@Controller({ path: "organizations/:id/reputation", version: "1" })
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get()
  async get(@Param("id") id: string) {
    const snapshot = await this.reputationService.latestForOrganization(id);
    return { data: snapshot };
  }
}
