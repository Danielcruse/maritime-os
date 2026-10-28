import { Module } from "@nestjs/common";
import { ChainAnchorService } from "./chain-anchor.service";
import { ChainController } from "./chain.controller";
import { ChainSchedulerService } from "./chain-scheduler.service";

@Module({
  controllers: [ChainController],
  providers: [ChainAnchorService, ChainSchedulerService],
  exports: [ChainAnchorService],
})
export class ChainModule {}
