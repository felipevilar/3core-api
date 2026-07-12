import { Injectable, Logger } from '@nestjs/common';
import {
  ChamadoNotificationInfo,
  ChamadoNotificationTarget,
  Notifier,
} from './notifier';

/**
 * Implementação padrão: apenas loga o e-mail que seria enviado. Substituível
 * por SmtpNotifier/ResendNotifier sem mudar os chamadores.
 */
@Injectable()
export class LogNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');

  notifyChamadoAtribuido(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${tecnico.email} | Chamado ${chamado.codigo} atribuído a você: "${chamado.titulo}"`,
    );
    return Promise.resolve();
  }

  notifyChamadoFinalizado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
  ): Promise<void> {
    const to = admins.map((a) => a.email).join(', ') || '(nenhum admin)';
    this.logger.log(
      `[email] -> ${to} | Chamado ${chamado.codigo} finalizado pelo técnico, aguardando conferência`,
    );
    return Promise.resolve();
  }

  notifyChamadoReaberto(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
    motivo: string | null,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${tecnico.email} | Chamado ${chamado.codigo} reaberto${motivo ? `: ${motivo}` : ''}`,
    );
    return Promise.resolve();
  }
}
