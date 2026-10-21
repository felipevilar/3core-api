import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Notificacao } from './entities/notificacao.entity';

export interface NovaNotificacao {
  tipo: string;
  titulo: string;
  corpo?: string | null;
  link?: string | null;
}

@Injectable()
export class NotificacoesService {
  constructor(
    @InjectRepository(Notificacao)
    private readonly repo: Repository<Notificacao>,
  ) {}

  /** Cria a mesma notificação para vários usuários (ignora lista vazia). */
  async criar(userIds: number[], data: NovaNotificacao) {
    const ids = [...new Set(userIds.filter((id) => Number.isInteger(id)))];
    if (!ids.length) return;
    await this.repo.insert(
      ids.map((userId) => ({
        userId,
        tipo: data.tipo,
        titulo: data.titulo,
        corpo: data.corpo ?? null,
        link: data.link ?? null,
      })),
    );
  }

  list(userId: number, naoLidas: boolean, limit = 50) {
    return this.repo.find({
      where: naoLidas ? { userId, lidaEm: IsNull() } : { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async countNaoLidas(userId: number) {
    const count = await this.repo.countBy({ userId, lidaEm: IsNull() });
    return { count };
  }

  async marcarLida(userId: number, id: number) {
    await this.repo.update({ id, userId }, { lidaEm: new Date() });
    return { success: true };
  }

  async marcarTodasLidas(userId: number) {
    await this.repo.update(
      { userId, lidaEm: IsNull() },
      { lidaEm: new Date() },
    );
    return { success: true };
  }

  async remover(userId: number, ids: number[]) {
    if (ids.length) await this.repo.delete({ userId, id: In(ids) });
    return { success: true };
  }
}
