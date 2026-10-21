import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from './entities/app-config.entity';
import { SlaPolitica } from './entities/sla-politica.entity';
import { Motivo } from './entities/motivo.entity';
import { ConfiguracoesService } from './configuracoes.service';
import { ConfiguracoesController } from './configuracoes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppConfig, SlaPolitica, Motivo])],
  controllers: [ConfiguracoesController],
  providers: [ConfiguracoesService],
  exports: [ConfiguracoesService],
})
export class ConfiguracoesModule {}
