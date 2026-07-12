import { Global, Module } from '@nestjs/common';
import { NOTIFIER } from './notifier';
import { LogNotifier } from './log-notifier';

/**
 * Fornece o Notifier via token DI. Global para qualquer módulo injetar sem
 * reimportar. Trocar a implementação (SMTP/Resend) é só mudar o useClass.
 */
@Global()
@Module({
  providers: [{ provide: NOTIFIER, useClass: LogNotifier }],
  exports: [NOTIFIER],
})
export class NotificationsModule {}
