import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OptionGroup } from './entities/option-group.entity';
import { OptionItem } from './entities/option-item.entity';
import { LandingAlertRecipient } from './entities/landing-alert-recipient.entity';
import { User } from '../auth/entities/user.entity';
import { LandingConfigController } from './landing-config.controller';
import { LandingConfigService } from './landing-config.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OptionGroup, OptionItem, LandingAlertRecipient, User]),
  ],
  controllers: [LandingConfigController],
  providers: [LandingConfigService],
  exports: [LandingConfigService],
})
export class LandingConfigModule {}
