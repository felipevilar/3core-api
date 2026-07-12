import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chamado } from './entities/chamado.entity';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

interface PayoutQuery {
  periodo?: string;
  tecnicoUserId?: number;
  paymentStatus?: string;
}

@Injectable()
export class FinanceiroService {
  constructor(
    @InjectRepository(Chamado)
    private readonly chamadoRepo: Repository<Chamado>,
  ) {}

  /**
   * Folha de pagamento agregada por técnico + competência. Considera chamados
   * fechados (valores congelados). LEFT JOIN em users para não perder técnicos
   * removidos (a identidade fica congelada em snapTecnicoNome).
   */
  async payout(query: PayoutQuery) {
    const qb = this.chamadoRepo
      .createQueryBuilder('c')
      .select('c.tecnicoUserId', 'tecnicoUserId')
      .addSelect('MAX(c.snapTecnicoNome)', 'tecnicoNome')
      .addSelect('c.paymentPeriodo', 'periodo')
      .addSelect('COUNT(*)', 'qtdChamados')
      .addSelect('SUM(c.custoTecnicoTotal)', 'totalCusto')
      .addSelect(
        `SUM(CASE WHEN c.paymentStatus = 'pendente' THEN c.custoTecnicoTotal ELSE 0 END)`,
        'totalPendente',
      )
      .addSelect(
        `SUM(CASE WHEN c.paymentStatus = 'aprovado' THEN c.custoTecnicoTotal ELSE 0 END)`,
        'totalAprovado',
      )
      .addSelect(
        `SUM(CASE WHEN c.paymentStatus = 'pago' THEN c.custoTecnicoTotal ELSE 0 END)`,
        'totalPago',
      )
      .where('c.status = :st', { st: 'fechado' })
      .groupBy('c.tecnicoUserId')
      .addGroupBy('c.paymentPeriodo')
      .orderBy('c.paymentPeriodo', 'DESC')
      .addOrderBy('MAX(c.snapTecnicoNome)', 'ASC');

    if (query.periodo)
      qb.andWhere('c.paymentPeriodo = :per', { per: query.periodo });
    if (query.tecnicoUserId)
      qb.andWhere('c.tecnicoUserId = :tid', { tid: query.tecnicoUserId });
    if (query.paymentStatus)
      qb.andWhere('c.paymentStatus = :ps', { ps: query.paymentStatus });

    return qb.getRawMany();
  }

  /**
   * Ganhos do próprio técnico: agregado por competência + breakdown por chamado.
   * Sempre escopado ao userId do requisitante (nunca recebe outro técnico).
   */
  async meusGanhos(user: AuthUser, periodo?: string) {
    const baseQb = this.chamadoRepo
      .createQueryBuilder('c')
      .where('c.status = :st', { st: 'fechado' })
      .andWhere('c.tecnicoUserId = :uid', { uid: user.userId });
    if (periodo) baseQb.andWhere('c.paymentPeriodo = :per', { per: periodo });

    const resumoQb = baseQb
      .clone()
      .select('c.paymentPeriodo', 'periodo')
      .addSelect('COUNT(*)', 'qtdChamados')
      .addSelect('SUM(c.custoTecnicoTotal)', 'totalCusto')
      .addSelect(
        `SUM(CASE WHEN c.paymentStatus = 'pago' THEN c.custoTecnicoTotal ELSE 0 END)`,
        'totalPago',
      )
      .groupBy('c.paymentPeriodo')
      .orderBy('c.paymentPeriodo', 'DESC');

    const chamadosQb = baseQb
      .clone()
      .leftJoinAndSelect('c.client', 'client')
      .orderBy('c.finalizadoEm', 'DESC');

    const [resumo, chamados] = await Promise.all([
      resumoQb.getRawMany(),
      chamadosQb.getMany(),
    ]);

    return {
      resumo,
      chamados: chamados.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        titulo: c.titulo,
        cliente: c.client?.nome ?? null,
        periodo: c.paymentPeriodo,
        custoTecnicoTotal: c.custoTecnicoTotal,
        paymentStatus: c.paymentStatus,
        finalizadoEm: c.finalizadoEm,
      })),
    };
  }
}
