import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { Chamado } from './entities/chamado.entity';
import { ChamadoComprovante } from './entities/chamado-comprovante.entity';
import {
  TechProfile,
  PagamentoInfo,
} from '../technicians/entities/tech-profile.entity';
import { ChamadosService } from './chamados.service';
import { PagamentoLoteDto } from './dto/chamado-actions.dto';
import {
  FINANCEIRO_CONFIG_ID,
  FinanceiroConfig,
} from './entities/financeiro-config.entity';
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
    @InjectRepository(TechProfile)
    private readonly techProfileRepo: Repository<TechProfile>,
    @InjectRepository(ChamadoComprovante)
    private readonly comprovanteRepo: Repository<ChamadoComprovante>,
    private readonly dataSource: DataSource,
    private readonly chamados: ChamadosService,
  ) {}

  // ============================================================ pagamentos em lote

  /**
   * Aprova ou paga vários repasses de uma vez. Cada chamado roda na própria
   * transação (via `updatePagamento`), então uma falha (ex.: transição
   * inválida) não derruba os demais — o resultado lista ok/erros por id.
   */
  async pagamentoLote(dto: PagamentoLoteDto, user: AuthUser) {
    const ids = [...new Set(dto.ids)];
    const ok: number[] = [];
    const erros: { id: number; motivo: string }[] = [];
    for (const id of ids) {
      try {
        await this.chamados.updatePagamento(
          id,
          { paymentStatus: dto.paymentStatus },
          user,
        );
        ok.push(id);
      } catch (e) {
        const err = e as {
          message?: string;
          response?: { message?: string | string[] };
        };
        const raw: string | string[] =
          err.response?.message ?? err.message ?? 'Erro';
        erros.push({ id, motivo: Array.isArray(raw) ? raw[0] : raw });
      }
    }
    return { ok, erros };
  }

  // ============================================================ configuração

  /** Configuração financeira da empresa (alíquota de imposto vigente). */
  async getConfig() {
    const config = await this.dataSource
      .getRepository(FinanceiroConfig)
      .findOneBy({ id: FINANCEIRO_CONFIG_ID });
    return {
      aliquotaImposto: config?.aliquotaImposto ?? '0.00',
      updatedAt: config?.updatedAt ?? null,
    };
  }

  /**
   * Troca a alíquota vigente e recalcula o imposto de todos os chamados ainda
   * NÃO fechados que emitem nota e seguem a alíquota da empresa. Fechados
   * mantêm a alíquota congelada da época; os com alíquota própria, a sua.
   * ROUND do Postgres = half-up no centavo, igual a percentOfMoney().
   */
  async updateConfig(aliquotaImposto: number, user: AuthUser) {
    const aliquota = aliquotaImposto.toFixed(2);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "financeiro_config" ("id", "aliquotaImposto", "updatedByUserId", "updatedAt")
         VALUES ($1, $2, $3, now())
         ON CONFLICT ("id") DO UPDATE
         SET "aliquotaImposto" = EXCLUDED."aliquotaImposto",
             "updatedByUserId" = EXCLUDED."updatedByUserId",
             "updatedAt" = now()`,
        [FINANCEIRO_CONFIG_ID, aliquota, user.userId],
      );
      await manager.query(
        `UPDATE "chamados"
         SET "aliquotaImposto" = $1::numeric,
             "impostoTotal" = ROUND("valorClienteTotal" * $1::numeric / 100, 2),
             "updatedAt" = now()
         WHERE "valoresCongeladosEm" IS NULL
           AND "emiteNota" = true
           AND "aliquotaImpostoManual" IS NULL`,
        [aliquota],
      );
    });
    return this.getConfig();
  }

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

    // Dados de pagamento (PIX/banco) dos técnicos do período, para o financeiro
    // copiar na hora do repasse, e quantidade de comprovantes por chamado.
    const tecnicoIds = [
      ...new Set(
        chamados
          .map((c) => c.tecnicoUserId)
          .filter((v): v is number => v != null),
      ),
    ];
    const pagamentoPorTecnico = new Map<number, PagamentoInfo | null>();
    if (tecnicoIds.length) {
      const perfis = await this.techProfileRepo.find({
        where: { userId: In(tecnicoIds) },
        select: { userId: true, pagamento: true },
      });
      for (const p of perfis) pagamentoPorTecnico.set(p.userId, p.pagamento);
    }
    const comprovantesPorChamado = new Map<number, number>();
    if (chamados.length) {
      const counts: { chamadoId: number; qtd: string }[] =
        await this.comprovanteRepo
          .createQueryBuilder('cp')
          .select('cp.chamadoId', 'chamadoId')
          .addSelect('COUNT(*)', 'qtd')
          .where('cp.chamadoId IN (:...ids)', {
            ids: chamados.map((c) => c.id),
          })
          .groupBy('cp.chamadoId')
          .getRawMany();
      for (const r of counts)
        comprovantesPorChamado.set(Number(r.chamadoId), Number(r.qtd));
    }

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
      emiteNota: c.emiteNota,
      aliquotaImposto: c.aliquotaImposto,
      impostoTotal: c.impostoTotal,
      custoTecnicoTotal: c.custoTecnicoTotal,
      // Lucro = receita bruta − imposto da nota − repasse ao técnico.
      margem: sumMoney([
        c.valorClienteTotal,
        `-${c.impostoTotal}`,
        `-${c.custoTecnicoTotal}`,
      ]),
      paymentStatus: c.paymentStatus,
      clientePaymentStatus: c.clientePaymentStatus,
      tecnicoPagamento:
        c.tecnicoUserId != null
          ? (pagamentoPorTecnico.get(c.tecnicoUserId) ?? null)
          : null,
      comprovantes: comprovantesPorChamado.get(c.id) ?? 0,
    }));

    // KPIs somados das mesmas linhas (centavos — sem erro de float).
    const faturamentoTotal = sumMoney(rows.map((r) => r.valorClienteTotal));
    const impostoTotal = sumMoney(rows.map((r) => r.impostoTotal));
    const repasseTotal = sumMoney(rows.map((r) => r.custoTecnicoTotal));
    const lucroBruto = sumMoney([
      faturamentoTotal,
      `-${impostoTotal}`,
      `-${repasseTotal}`,
    ]);
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
        impostoTotal,
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
