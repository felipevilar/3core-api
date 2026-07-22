import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Chamado } from './entities/chamado.entity';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { sumMoney } from '../common/br-money';

interface PayoutQuery {
  periodo?: string;
  tecnicoUserId?: number;
  paymentStatus?: string;
}

/** Intervalo de datas (YYYY-MM-DD) para o painel financeiro. */
interface OverviewQuery {
  de?: string;
  ate?: string;
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
   * Painel financeiro consolidado de um PERÍODO (default: mês vigente).
   *
   * Considera apenas chamados FECHADOS (valores congelados), filtrados pela data
   * de finalização (o "atendimento") comparada no fuso America/Sao_Paulo — mesma
   * lógica de intervalo da lista de chamados, evitando o shift de UTC.
   *
   * Devolve os KPIs e a lista completa de atendimentos do período numa única
   * consulta: os cards são somados em JS (centavos, sem drift) a partir das
   * MESMAS linhas da tabela, garantindo que totais e tabela sempre batam.
   */
  async overview(query: OverviewQuery) {
    // Default: intervalo do mês vigente (America/Sao_Paulo).
    const { de, ate } = this.resolvePeriodo(query);

    const qb = this.chamadoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.city', 'city')
      .where('c.status = :st', { st: 'fechado' })
      .orderBy('c.finalizadoEm', 'DESC')
      .addOrderBy('c.id', 'DESC');
    this.applyFinalizadoRange(qb, de, ate);

    const chamados = await qb.getMany();

    const rows = chamados.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      titulo: c.titulo,
      clientId: c.clientId,
      cliente: c.client?.nome ?? null,
      cidade: c.city ? `${c.city.nome}/${c.city.uf}` : null,
      tecnicoUserId: c.tecnicoUserId,
      tecnicoNome: c.snapTecnicoNome ?? null,
      finalizadoEm: c.finalizadoEm,
      paymentPeriodo: c.paymentPeriodo,
      valorClienteTotal: c.valorClienteTotal,
      custoTecnicoTotal: c.custoTecnicoTotal,
      margem: sumMoney([c.valorClienteTotal, `-${c.custoTecnicoTotal}`]),
      paymentStatus: c.paymentStatus,
      clientePaymentStatus: c.clientePaymentStatus,
    }));

    // KPIs somados das mesmas linhas (centavos — sem erro de float).
    const faturamentoTotal = sumMoney(rows.map((r) => r.valorClienteTotal));
    const repasseTotal = sumMoney(rows.map((r) => r.custoTecnicoTotal));
    const lucroBruto = sumMoney([faturamentoTotal, `-${repasseTotal}`]);
    const pendenteReceber = sumMoney(
      rows
        .filter((r) => r.clientePaymentStatus === 'pendente')
        .map((r) => r.valorClienteTotal),
    );
    const recebido = sumMoney([faturamentoTotal, `-${pendenteReceber}`]);
    const pendentePagar = sumMoney(
      rows
        .filter((r) => r.paymentStatus !== 'pago')
        .map((r) => r.custoTecnicoTotal),
    );
    const pagoTecnicos = sumMoney([repasseTotal, `-${pendentePagar}`]);
    // Saldo realizado = o que ENTROU (cliente pagou) - o que SAIU (técnico pago).
    const saldoRealizado = sumMoney([recebido, `-${pagoTecnicos}`]);

    return {
      periodo: { de, ate },
      kpis: {
        faturamentoTotal,
        lucroBruto,
        pendenteReceber,
        pendentePagar,
        saldoRealizado,
        // Extras úteis para conciliação (não são cards obrigatórios).
        repasseTotal,
        recebido,
        pagoTecnicos,
        qtdChamados: rows.length,
      },
      rows,
    };
  }

  /** Resolve o intervalo; sem de/ate assume o mês vigente (America/Sao_Paulo). */
  private resolvePeriodo(query: OverviewQuery): { de: string; ate: string } {
    // Trata string vazia como ausente (o front pode enviar ?de=&ate=).
    const de = query.de?.trim() || undefined;
    const ate = query.ate?.trim() || undefined;
    if (de && ate) return { de, ate };
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const hoje = fmt.format(new Date()); // YYYY-MM-DD
    const primeiroDia = `${hoje.slice(0, 7)}-01`;
    return { de: de ?? primeiroDia, ate: ate ?? hoje };
  }

  /** Intervalo [de, ate] inclusivo sobre finalizadoEm no fuso America/Sao_Paulo. */
  private applyFinalizadoRange(
    qb: SelectQueryBuilder<Chamado>,
    de?: string,
    ate?: string,
  ) {
    const localDate = `(c.finalizadoEm AT TIME ZONE 'America/Sao_Paulo')::date`;
    if (de) qb.andWhere(`${localDate} >= :de`, { de });
    if (ate) qb.andWhere(`${localDate} <= :ate`, { ate });
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
