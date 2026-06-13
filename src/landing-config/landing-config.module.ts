import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionGroup } from './entities/option-group.entity';
import { OptionItem } from './entities/option-item.entity';
import { LandingConfigController } from './landing-config.controller';
import { LandingConfigService } from './landing-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([OptionGroup, OptionItem])],
  controllers: [LandingConfigController],
  providers: [LandingConfigService],
})
export class LandingConfigModule {}
