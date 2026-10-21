import { Injectable, Logger } from '@nestjs/common';
import { Notifier } from './notifier';

/**
 * Encaminha cada notificação a todos os provedores (e-mail + in-app). Uma
 * falha num provedor não impede os demais — só é logada.
 */
@Injectable()
export class CompositeNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');

  constructor(private readonly providers: Notifier[]) {}

  private async fanout(
    fn: (n: Notifier) => Promise<void>,
    label: string,
  ): Promise<void> {
    await Promise.all(
      this.providers.map((p) =>
        fn(p).catch((e) =>
          this.logger.warn(
            `${p.constructor.name}.${label} falhou: ${(e as Error).message}`,
          ),
        ),
      ),
    );
  }

  notifyChamadoAtribuido(
    ...args: Parameters<Notifier['notifyChamadoAtribuido']>
  ) {
    return this.fanout((n) => n.notifyChamadoAtribuido(...args), 'atribuido');
  }
  notifyChamadoFinalizado(
    ...args: Parameters<Notifier['notifyChamadoFinalizado']>
  ) {
    return this.fanout((n) => n.notifyChamadoFinalizado(...args), 'finalizado');
  }
  notifyChamadoReaberto(
    ...args: Parameters<Notifier['notifyChamadoReaberto']>
  ) {
    return this.fanout((n) => n.notifyChamadoReaberto(...args), 'reaberto');
  }
  notifyClienteACaminho(
    ...args: Parameters<Notifier['notifyClienteACaminho']>
  ) {
    return this.fanout(
      (n) => n.notifyClienteACaminho(...args),
      'clienteACaminho',
    );
  }
  notifyClienteConcluido(
    ...args: Parameters<Notifier['notifyClienteConcluido']>
  ) {
    return this.fanout(
      (n) => n.notifyClienteConcluido(...args),
      'clienteConcluido',
    );
  }
  notifySlaEstourado(...args: Parameters<Notifier['notifySlaEstourado']>) {
    return this.fanout((n) => n.notifySlaEstourado(...args), 'slaEstourado');
  }
  notifySolicitacaoExpirada(
    ...args: Parameters<Notifier['notifySolicitacaoExpirada']>
  ) {
    return this.fanout(
      (n) => n.notifySolicitacaoExpirada(...args),
      'solicitacaoExpirada',
    );
  }
  notifyComentario(...args: Parameters<Notifier['notifyComentario']>) {
    return this.fanout((n) => n.notifyComentario(...args), 'comentario');
  }
}
