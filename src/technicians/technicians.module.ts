import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TechProfile } from './entities/tech-profile.entity';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { TechniciansService } from './technicians.service';
import { TechniciansController } from './technicians.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TechProfile, User, Role])],
  controllers: [TechniciansController],
  providers: [TechniciansService],
})
export class TechniciansModule {}
