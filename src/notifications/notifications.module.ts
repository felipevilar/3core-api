import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFIER } from './notifier';
import { ResendNotifier } from './resend-notifier';
import { LogNotifier } from './log-notifier';
import { InAppNotifier } from './in-app-notifier';
import { CompositeNotifier } from './composite-notifier';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

/**
 * E-mail (Resend quando há RESEND_API_KEY; senão só log) + in-app. Trocar o
 * provedor de e-mail continua sendo um swap aqui, sem tocar nos chamadores.
 */
@Global()
@Module({
  imports: [NotificacoesModule],
  providers: [
    {
      provide: NOTIFIER,
      inject: [ConfigService, NotificacoesService],
      useFactory: (
        config: ConfigService,
        notificacoes: NotificacoesService,
      ) => {
        const email = config.get<string>('RESEND_API_KEY')
          ? new ResendNotifier(config)
          : new LogNotifier();
        return new CompositeNotifier([email, new InAppNotifier(notificacoes)]);
      },
    },
  ],
  exports: [NOTIFIER],
})
export class NotificationsModule {}
