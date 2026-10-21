import { Injectable } from '@nestjs/common';
import {
  ChamadoNotificationInfo,
  ChamadoNotificationTarget,
  Notifier,
} from './notifier';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

/**
 * Notificações in-app (sino do dashboard). Só alcança alvos com `userId`
 * (usuários do sistema); clientes externos são ignorados aqui.
 */
@Injectable()
export class InAppNotifier implements Notifier {
  constructor(private readonly notificacoes: NotificacoesService) {}

  private ids(targets: ChamadoNotificationTarget[]) {
    return targets
      .map((t) => t.userId)
      .filter((id): id is number => typeof id === 'number');
  }

  private link(chamado: ChamadoNotificationInfo) {
    return `/chamados/${chamado.id}`;
  }

  notifyChamadoAtribuido(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
  ) {
    return this.notificacoes.criar(this.ids([tecnico]), {
      tipo: 'chamado_atribuido',
      titulo: `Chamado ${chamado.codigo} atribuído a você`,
      corpo: chamado.titulo,
      link: '/chamados/solicitacoes',
    });
  }

  notifyChamadoFinalizado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
  ) {
    return this.notificacoes.criar(this.ids(admins), {
      tipo: 'chamado_finalizado',
      titulo: `Chamado ${chamado.codigo} finalizado`,
      corpo: 'Aguardando conferência e fechamento.',
      link: this.link(chamado),
    });
  }

  notifyChamadoReaberto(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
    motivo: string | null,
  ) {
    return this.notificacoes.criar(this.ids([tecnico]), {
      tipo: 'chamado_reaberto',
      titulo: `Chamado ${chamado.codigo} reaberto`,
      corpo: motivo,
      link: this.link(chamado),
    });
  }

  // Cliente externo não tem conta: nada a fazer in-app.
  notifyClienteACaminho(): Promise<void> {
    return Promise.resolve();
  }

  notifyClienteConcluido(): Promise<void> {
    return Promise.resolve();
  }

  notifySlaEstourado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    detalhe: string,
  ) {
    return this.notificacoes.criar(this.ids(admins), {
      tipo: 'sla_estourado',
      titulo: `SLA estourado — ${chamado.codigo}`,
      corpo: detalhe,
      link: this.link(chamado),
    });
  }

  notifySolicitacaoExpirada(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    tecnicoNome: string | null,
  ) {
    return this.notificacoes.criar(this.ids(admins), {
      tipo: 'solicitacao_expirada',
      titulo: `Solicitação expirada — ${chamado.codigo}`,
      corpo: tecnicoNome
        ? `${tecnicoNome} não respondeu no prazo. O chamado voltou para aberto.`
        : 'O chamado voltou para aberto.',
      link: this.link(chamado),
    });
  }

  notifyComentario(
    chamado: ChamadoNotificationInfo,
    targets: ChamadoNotificationTarget[],
    autorNome: string,
    texto: string,
  ) {
    return this.notificacoes.criar(this.ids(targets), {
      tipo: 'comentario',
      titulo: `${autorNome} comentou em ${chamado.codigo}`,
      corpo: texto.slice(0, 200),
      link: this.link(chamado),
    });
  }
}
