import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechProfile } from './entities/tech-profile.entity';
import { TechServiceArea } from './entities/tech-service-area.entity';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { TechniciansService } from './technicians.service';
import {
  TechniciansAdminController,
  TechniciansController,
} from './technicians.controller';
import { LandingConfigModule } from '../landing-config/landing-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TechProfile, TechServiceArea, User, Role]),
    LandingConfigModule,
  ],
  controllers: [TechniciansController, TechniciansAdminController],
  providers: [TechniciansService],
})
export class TechniciansModule {}
