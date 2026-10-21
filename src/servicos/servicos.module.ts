import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Servico } from './entities/servico.entity';
import { ServicosService } from './servicos.service';
import { ServicosController } from './servicos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Servico])],
  controllers: [ServicosController],
  providers: [ServicosService],
  exports: [ServicosService],
})
export class ServicosModule {}
