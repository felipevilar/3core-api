import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChamadosService } from './chamados.service';

/** Rotinas automáticas do fluxo de chamados (expiração de aceite e SLA). */
@Injectable()
export class ChamadosScheduler {
  private readonly logger = new Logger(ChamadosScheduler.name);

  constructor(private readonly chamados: ChamadosService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirarSolicitacoes() {
    const n = await this.chamados.expirarSolicitacoes();
    if (n) this.logger.log(`${n} solicitação(ões) expirada(s)`);
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async monitorarSla() {
    const n = await this.chamados.monitorarSla();
    if (n) this.logger.log(`${n} chamado(s) com SLA estourado alertado(s)`);
  }
}
