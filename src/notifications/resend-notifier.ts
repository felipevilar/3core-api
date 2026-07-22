import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  ChamadoNotificationInfo,
  ChamadoNotificationTarget,
  Notifier,
} from './notifier';

@Injectable()
export class ResendNotifier implements Notifier {
  private readonly logger = new Logger('ResendNotifier');
  private readonly resend: Resend;
  private readonly from = 'noreply@3coretecnologia.com';

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
  }

  async notifyChamadoAtribuido(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
  ): Promise<void> {
    await this.send({
      to: tecnico.email,
      subject: `Chamado ${chamado.codigo} atribuído a você`,
      html: `
        <p>Olá, <strong>${tecnico.name}</strong>.</p>
        <p>O chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — foi atribuído a você.</p>
        <p>Status atual: <strong>${chamado.status}</strong>.</p>
      `,
    });
  }

  async notifyChamadoFinalizado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
  ): Promise<void> {
    if (!admins.length) return;
    await this.send({
      to: admins.map((a) => a.email),
      subject: `Chamado ${chamado.codigo} finalizado — aguardando conferência`,
      html: `
        <p>O chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — foi finalizado pelo técnico.</p>
        <p>Por favor, revise e feche o chamado quando estiver tudo certo.</p>
      `,
    });
  }

  async notifyChamadoReaberto(
    chamado: ChamadoNotificationInfo,
    tecnico: ChamadoNotificationTarget,
    motivo: string | null,
  ): Promise<void> {
    await this.send({
      to: tecnico.email,
      subject: `Chamado ${chamado.codigo} foi reaberto`,
      html: `
        <p>Olá, <strong>${tecnico.name}</strong>.</p>
        <p>O chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — foi reaberto.</p>
        ${motivo ? `<p>Motivo: <em>${motivo}</em></p>` : ''}
      `,
    });
  }

  private async send(params: {
    to: string | string[];
    subject: string;
    html: string;
  }): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        this.logger.error(`Resend error: ${JSON.stringify(error)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send email: ${(err as Error).message}`);
    }
  }
}
