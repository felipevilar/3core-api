import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chamado } from './entities/chamado.entity';
import { ChamadoLineItem } from './entities/chamado-line-item.entity';
import { ChamadoEvent } from './entities/chamado-event.entity';
import { ChamadoRat } from './entities/chamado-rat.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../auth/entities/user.entity';
import { TechProfile } from '../technicians/entities/tech-profile.entity';
import { TechServiceArea } from '../technicians/entities/tech-service-area.entity';
import { ChamadosService } from './chamados.service';
import { FinanceiroService } from './financeiro.service';
import { ChamadosController } from './chamados.controller';
import { FinanceiroController } from './financeiro.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chamado,
      ChamadoLineItem,
      ChamadoEvent,
      ChamadoRat,
      Client,
      User,
      TechProfile,
      TechServiceArea,
    ]),
  ],
  controllers: [ChamadosController, FinanceiroController],
  providers: [ChamadosService, FinanceiroService],
})
export class ChamadosModule {}
