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

  async notifyClienteACaminho(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
    tecnicoNome: string | null,
  ): Promise<void> {
    if (!cliente.email) return;
    await this.send({
      to: cliente.email,
      subject: `Técnico a caminho — chamado ${chamado.codigo}`,
      html: `
        <p>Olá, <strong>${cliente.name}</strong>.</p>
        <p>${tecnicoNome ? `O técnico <strong>${tecnicoNome}</strong>` : 'Nosso técnico'} está a caminho para o atendimento do chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em>.</p>
      `,
    });
  }

  async notifyClienteConcluido(
    chamado: ChamadoNotificationInfo,
    cliente: ChamadoNotificationTarget,
  ): Promise<void> {
    if (!cliente.email) return;
    await this.send({
      to: cliente.email,
      subject: `Atendimento concluído — chamado ${chamado.codigo}`,
      html: `
        <p>Olá, <strong>${cliente.name}</strong>.</p>
        <p>O atendimento do chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — foi concluído pelo nosso técnico.</p>
        <p>Obrigado pela confiança.</p>
      `,
    });
  }

  async notifySlaEstourado(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    detalhe: string,
  ): Promise<void> {
    if (!admins.length) return;
    await this.send({
      to: admins.map((a) => a.email),
      subject: `SLA estourado — chamado ${chamado.codigo}`,
      html: `
        <p>O chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — estourou o SLA.</p>
        <p>${detalhe}</p>
      `,
    });
  }

  async notifySolicitacaoExpirada(
    chamado: ChamadoNotificationInfo,
    admins: ChamadoNotificationTarget[],
    tecnicoNome: string | null,
  ): Promise<void> {
    if (!admins.length) return;
    await this.send({
      to: admins.map((a) => a.email),
      subject: `Solicitação expirada — chamado ${chamado.codigo}`,
      html: `
        <p>A solicitação do chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em> — expirou sem aceite${tecnicoNome ? ` de <strong>${tecnicoNome}</strong>` : ''}.</p>
        <p>O chamado voltou para <strong>aberto</strong>; atribua outro técnico.</p>
      `,
    });
  }

  async notifyComentario(
    chamado: ChamadoNotificationInfo,
    targets: ChamadoNotificationTarget[],
    autorNome: string,
    texto: string,
  ): Promise<void> {
    if (!targets.length) return;
    await this.send({
      to: targets.map((t) => t.email),
      subject: `Novo comentário — chamado ${chamado.codigo}`,
      html: `
        <p><strong>${autorNome}</strong> comentou no chamado <strong>${chamado.codigo}</strong> — <em>${chamado.titulo}</em>:</p>
        <blockquote>${texto}</blockquote>
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
