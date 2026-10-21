import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './entities/client.entity';
import { ClientLocal } from './entities/client-local.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientLocal])],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
