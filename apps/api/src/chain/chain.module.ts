import { Module } from "@nestjs/common";
import { ChainAnchorService } from "./chain-anchor.service";
import { ChainController } from "./chain.controller";

@Module({
  controllers: [ChainController],
  providers: [ChainAnchorService],
  exports: [ChainAnchorService],
})
export class ChainModule {}
