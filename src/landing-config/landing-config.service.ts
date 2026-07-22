import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { Resend } from 'resend';
import { OptionGroup } from './entities/option-group.entity';
import { OptionItem } from './entities/option-item.entity';
import { LandingAlertRecipient } from './entities/landing-alert-recipient.entity';
import { User } from '../auth/entities/user.entity';

export interface AlertRecipientDto {
  id: number;
  name: string;
  email: string;
  role: string;
}

@Injectable()
export class LandingConfigService {
  private readonly logger = new Logger(LandingConfigService.name);
  private readonly resend: Resend;
  private readonly from = 'noreply@3coretecnologia.com';

  constructor(
    @InjectRepository(OptionGroup)
    private readonly groupRepo: Repository<OptionGroup>,
    @InjectRepository(OptionItem)
    private readonly itemRepo: Repository<OptionItem>,
    @InjectRepository(LandingAlertRecipient)
    private readonly recipientRepo: Repository<LandingAlertRecipient>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {
    this.resend = new Resend(config.getOrThrow<string>('RESEND_API_KEY'));
  }

  findGroups(type: string) {
    return this.groupRepo.find({
      where: { type },
      relations: ['items'],
      order: { order: 'ASC', items: { order: 'ASC' } },
    });
  }

  createGroup(body: { type: string; name: string; order?: number }) {
    return this.groupRepo.save(this.groupRepo.create(body));
  }

  async updateGroup(
    id: number,
    body: { name?: string; order?: number; active?: boolean },
  ) {
    const group = await this.groupRepo.findOneBy({ id });
    if (!group) throw new NotFoundException('Group not found');
    Object.assign(group, body);
    return this.groupRepo.save(group);
  }

  async removeGroup(id: number) {
    const group = await this.groupRepo.findOneBy({ id });
    if (!group) throw new NotFoundException('Group not found');
    return this.groupRepo.remove(group);
  }

  async createItem(groupId: number, body: { label: string; order?: number }) {
    const group = await this.groupRepo.findOneBy({ id: groupId });
    if (!group) throw new NotFoundException('Group not found');
    return this.itemRepo.save(this.itemRepo.create({ ...body, group }));
  }

  async updateItem(
    id: number,
    body: { label?: string; order?: number; active?: boolean },
  ) {
    const item = await this.itemRepo.findOneBy({ id });
    if (!item) throw new NotFoundException('Item not found');
    Object.assign(item, body);
    return this.itemRepo.save(item);
  }

  async removeItem(id: number) {
    const item = await this.itemRepo.findOneBy({ id });
    if (!item) throw new NotFoundException('Item not found');
    return this.itemRepo.remove(item);
  }

  async findAlertRecipients(): Promise<AlertRecipientDto[]> {
    const rows = await this.recipientRepo.find();
    return rows.map((r) => this.toRecipientDto(r.user));
  }

  async setAlertRecipients(userIds: number[]): Promise<AlertRecipientDto[]> {
    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];

    await this.recipientRepo.createQueryBuilder()
      .delete()
      .from(LandingAlertRecipient)
      .execute();

    if (users.length) {
      const entries = users.map((u) =>
        this.recipientRepo.create({ user: u }),
      );
      await this.recipientRepo.save(entries);
    }

    return users.map((u) => this.toRecipientDto(u));
  }

  /** Usado internamente pelo TechniciansService para buscar os destinatários. */
  async findAlertRecipientEmails(): Promise<{ email: string; name: string }[]> {
    const rows = await this.recipientRepo.find();
    return rows.map((r) => ({ email: r.user.email, name: r.user.name }));
  }

  async sendNewTechAlert(
    recipients: { email: string; name: string }[],
    techName: string,
    techEmail: string,
  ): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: recipients.map((r) => r.email),
        subject: `Novo técnico cadastrado: ${techName}`,
        html: `
          <p>Um novo técnico se cadastrou pela landing page.</p>
          <table style="border-collapse:collapse;font-size:14px">
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Nome</td><td><strong>${techName}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#6b7280">E-mail</td><td>${techEmail}</td></tr>
          </table>
          <p style="margin-top:16px">Acesse o dashboard para revisar o cadastro.</p>
        `,
      });
      if (error) {
        this.logger.error(`Resend error on tech alert: ${JSON.stringify(error)}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send tech alert: ${(err as Error).message}`);
    }
  }

  private toRecipientDto(user: User): AlertRecipientDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role?.name ?? '',
    };
  }
}
