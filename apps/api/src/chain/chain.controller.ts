import { Controller, Get, Param } from "@nestjs/common";
import { ChainAnchorService } from "./chain-anchor.service";

@Controller({ path: "audit/anchors", version: "1" })
export class ChainController {
  constructor(private readonly chainAnchorService: ChainAnchorService) {}

  @Get(":id")
  async getStatus(@Param("id") id: string) {
    return { data: await this.chainAnchorService.getStatus(id) };
  }
}
