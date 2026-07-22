import { Global, Module } from '@nestjs/common';
import { NOTIFIER } from './notifier';
import { ResendNotifier } from './resend-notifier';

@Global()
@Module({
  providers: [{ provide: NOTIFIER, useClass: ResendNotifier }],
  exports: [NOTIFIER],
})
export class NotificationsModule {}
