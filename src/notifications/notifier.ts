/**
 * Costura de notificações. A implementação atual (LogNotifier) apenas registra
 * no log — troca por um provedor real (SMTP/Resend) é um swap de provider, sem
 * tocar em quem chama. As chamadas devem ser feitas APÓS o commit da transação
 * e nunca podem derrubar o fluxo (fire-and-forget com try/catch).
 */

export interface ChamadoNotificationTarget {
  email: string;
  name: string;
  // Presente para usuários do sistema (habilita notificação in-app).
  userId?: number;
}

export interface ChamadoNotificationInfo {
  id: number;
  codigo: string;
  titulo: string;
  status: string;
}

export interface Notifier {
  /** Técnico foi atribuído a um chamado. */
  notifyChamadoAtribuido(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
  ): Promise<void>;

  /** Técnico finalizou; avisa os admins para conferência. */
  notifyChamadoFinalizado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
  ): Promise<void>;

  /** Chamado reaberto; avisa o técnico. */
  notifyChamadoReaberto(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
    motivo: string | null,
  ): Promise<void>;

  /** Técnico saiu para o atendimento; avisa o cliente. */
  notifyClienteACaminho(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
    tecnicoNome: string | null,
  ): Promise<void>;

  /** Atendimento concluído pelo técnico; avisa o cliente. */
  notifyClienteConcluido(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
  ): Promise<void>;

  /** SLA estourado (1ª visita ou conclusão); avisa os gestores. */
  notifySlaEstourado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    detalhe: string,
  ): Promise<void>;

  /** Solicitação expirou sem aceite do técnico; avisa os gestores. */
  notifySolicitacaoExpirada(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    tecnicoNome: string | null,
  ): Promise<void>;

  /** Novo comentário no chamado; avisa a outra parte (técnico ou gestores). */
  notifyComentario(
    chamado: ChamadoNotificationInfo,
    targets: ChamadoNotificationTarget[],
    autorNome: string,
    texto: string,
  ): Promise<void>;
}

/** Token de injeção do Notifier. */
export const NOTIFIER = Symbol('NOTIFIER');
