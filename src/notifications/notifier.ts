/**
 * Costura de notificações. A implementação atual (LogNotifier) apenas registra
 * no log — troca por um provedor real (SMTP/Resend) é um swap de provider, sem
 * tocar em quem chama. As chamadas devem ser feitas APÓS o commit da transação
 * e nunca podem derrubar o fluxo (fire-and-forget com try/catch).
 */

export interface ChamadoNotificationTarget {
  email: string;
  name: string;
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
}

/** Token de injeção do Notifier. */
export const NOTIFIER = Symbol('NOTIFIER');
