import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chamado } from './entities/chamado.entity';
import { ChamadoLineItem } from './entities/chamado-line-item.entity';
import { ChamadoEvent } from './entities/chamado-event.entity';
import { ChamadoRat } from './entities/chamado-rat.entity';
import { ChamadoComprovante } from './entities/chamado-comprovante.entity';
import { ChamadoVisita } from './entities/chamado-visita.entity';
import { ChamadoVisitaPausa } from './entities/chamado-visita-pausa.entity';
import { ClientLocal } from '../clients/entities/client-local.entity';
import { ChamadoComentario } from './entities/chamado-comentario.entity';
import { ServicosModule } from '../servicos/servicos.module';
import { ChamadosScheduler } from './chamados.scheduler';
import { ConfiguracoesModule } from '../configuracoes/configuracoes.module';
import { FinanceiroConfig } from './entities/financeiro-config.entity';
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
      ChamadoComprovante,
      ChamadoVisita,
      ChamadoVisitaPausa,
      ClientLocal,
      ChamadoComentario,
      FinanceiroConfig,
      Client,
      User,
      TechProfile,
      TechServiceArea,
    ]),
    ConfiguracoesModule,
    ServicosModule,
  ],
  controllers: [ChamadosController, FinanceiroController],
  providers: [ChamadosService, FinanceiroService, ChamadosScheduler],
})
export class ChamadosModule {}
