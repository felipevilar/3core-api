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

  notifyClienteACaminho(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
    tecnicoNome: string | null,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${cliente.email} | Técnico ${tecnicoNome ?? ''} a caminho para o chamado ${chamado.codigo}`,
    );
    return Promise.resolve();
  }

  notifyClienteConcluido(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${cliente.email} | Chamado ${chamado.codigo} concluído`,
    );
    return Promise.resolve();
  }

  notifySlaEstourado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    detalhe: string,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${admins.map((a) => a.email).join(', ')} | SLA estourado no chamado ${chamado.codigo}: ${detalhe}`,
    );
    return Promise.resolve();
  }

  notifySolicitacaoExpirada(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    tecnicoNome: string | null,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${admins.map((a) => a.email).join(', ')} | Solicitação do chamado ${chamado.codigo} expirou (${tecnicoNome ?? 'técnico'})`,
    );
    return Promise.resolve();
  }

  notifyComentario(
    chamado: ChamadoNotificationInfo,
    targets: ChamadoNotificationTarget[],
    autorNome: string,
    texto: string,
  ): Promise<void> {
    this.logger.log(
      `[email] -> ${targets.map((t) => t.email).join(', ')} | ${autorNome} comentou no chamado ${chamado.codigo}: ${texto.slice(0, 80)}`,
    );
    return Promise.resolve();
  }
}
