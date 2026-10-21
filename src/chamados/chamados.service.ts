import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Chamado, ChamadoStatus } from './entities/chamado.entity';
import { ChamadoLineItem } from './entities/chamado-line-item.entity';
import { ChamadoEvent } from './entities/chamado-event.entity';
import { ChamadoRat } from './entities/chamado-rat.entity';
import {
  ChamadoVisita,
  VISITA_STATUS_ATIVOS,
  VisitaStatus,
} from './entities/chamado-visita.entity';
import { ChamadoVisitaPausa } from './entities/chamado-visita-pausa.entity';
import { ChamadoComentario } from './entities/chamado-comentario.entity';
import {
  FINANCEIRO_CONFIG_ID,
  FinanceiroConfig,
} from './entities/financeiro-config.entity';
import { Client } from '../clients/entities/client.entity';
import { ClientLocal } from '../clients/entities/client-local.entity';
import { User } from '../auth/entities/user.entity';
import { TechServiceArea } from '../technicians/entities/tech-service-area.entity';
import { CreateChamadoDto } from './dto/create-chamado.dto';
import { UpdateChamadoDto } from './dto/update-chamado.dto';
import { ListChamadosQueryDto } from './dto/list-chamados.query.dto';
import { AgendaQueryDto } from './dto/agenda.query.dto';
import {
  AtribuirDto,
  ComentarioDto,
  CreateLineItemDto,
  CreateRatDto,
  CreateVisitaDto,
  FinalizarDto,
  GeoDto,
  MinhaRotaQueryDto,
  MotivoDto,
  PausarDto,
  TransicaoCampoDto,
  UpdateImpostoDto,
  UpdateLineItemDto,
  UpdatePagamentoDto,
} from './dto/chamado-actions.dto';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { NOTIFIER } from '../notifications/notifier';
import type { Notifier } from '../notifications/notifier';
import {
  multiplyMoney,
  parseBrMoney,
  percentOfMoney,
  sumMoney,
} from '../common/br-money';
import { distanceMeters, hasCoords } from '../common/geo';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';
import { StorageService } from '../storage/storage.service';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { AppConfig } from '../configuracoes/entities/app-config.entity';
import { ServicosService } from '../servicos/servicos.service';

const PERM_GERENCIAR = 'atendimentos.gerenciar';

/** Ator das ações automáticas (cron): sem userId, auditado como "sistema". */
export const SYSTEM_USER: AuthUser = {
  userId: null as unknown as number,
  email: 'sistema',
  role: 'system',
  permissions: [PERM_GERENCIAR],
};
const PERM_FIN_VER = 'financeiro.ver';
const PERM_FIN_GERENCIAR = 'financeiro.gerenciar';

/** Snapshot do técnico + tarifas congeladas na atribuição de uma visita. */
interface SnapshotTecnico {
  tecnico: User;
  techProfileId: number;
  snapValorHora: string | null;
  snapCustoPorKm: string | null;
  snapCustoKmCidade: string | null;
}

@Injectable()
export class ChamadosService {
  private readonly logger = new Logger(ChamadosService.name);

  constructor(
    @InjectRepository(Chamado)
    private readonly chamadoRepo: Repository<Chamado>,
    @InjectRepository(ChamadoRat)
    private readonly ratRepo: Repository<ChamadoRat>,
    @InjectRepository(ChamadoVisita)
    private readonly visitaRepo: Repository<ChamadoVisita>,
    private readonly dataSource: DataSource,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly storage: StorageService,
    private readonly config: ConfiguracoesService,
    private readonly servicos: ServicosService,
  ) {}

  // ============================================================ helpers

  private isGerente(user: AuthUser): boolean {
    return user.permissions.includes(PERM_GERENCIAR);
  }

  /** Restringe queries ao próprio técnico quando ele não é gerente. */
  private applyTecnicoScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user: AuthUser,
    alias = 'c',
  ) {
    if (!this.isGerente(user)) {
      qb.andWhere(`${alias}.tecnicoUserId = :uid`, { uid: user.userId });
    }
  }

  /** Competência YYYY-MM de uma data em America/Sao_Paulo (evita bug de UTC). */
  private competenciaDe(date: Date): string {
    // en-CA => "YYYY-MM-DD"; fatiamos o mês no fuso correto.
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return ymd.slice(0, 7);
  }

  private async loadOrFail(id: number, manager?: EntityManager) {
    if (manager) {
      // Dentro de transação: trava a linha (pessimistic_write) para serializar
      // transições concorrentes — o @VersionColumn sozinho não adiciona WHERE
      // version=N no UPDATE do save(), então o lock é a garantia real.
      const chamado = await manager.getRepository(Chamado).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!chamado) throw new NotFoundException('Chamado não encontrado');
      return chamado;
    }
    const chamado = await this.chamadoRepo.findOne({ where: { id } });
    if (!chamado) throw new NotFoundException('Chamado não encontrado');
    return chamado;
  }

  /**
   * Visita atual do chamado (travada), ou null quando o chamado nunca teve
   * visita. SEMPRE chamar depois de loadOrFail (ordem de lock: chamado → visita).
   */
  private async loadVisitaAtual(
    manager: EntityManager,
    chamado: Chamado,
  ): Promise<ChamadoVisita | null> {
    if (!chamado.visitaAtualId) return null;
    return manager.getRepository(ChamadoVisita).findOne({
      where: { id: chamado.visitaAtualId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** Visita atual obrigatória e num dos status permitidos. */
  private async visitaAtualOrFail(
    manager: EntityManager,
    chamado: Chamado,
    permitidos: VisitaStatus[],
  ): Promise<ChamadoVisita> {
    const visita = await this.loadVisitaAtual(manager, chamado);
    if (!visita || !permitidos.includes(visita.status)) {
      throw new ConflictException(
        `Ação inválida para o status atual (${chamado.status})`,
      );
    }
    return visita;
  }

  /** Registra um evento de auditoria dentro da transação. */
  private async logEvent(
    manager: EntityManager,
    chamadoId: number,
    user: AuthUser,
    data: {
      tipo: string;
      statusAnterior?: string | null;
      statusNovo?: string | null;
      nota?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const repo = manager.getRepository(ChamadoEvent);
    const event = repo.create({
      chamadoId,
      tipo: data.tipo as ChamadoEvent['tipo'],
      statusAnterior: data.statusAnterior ?? null,
      statusNovo: data.statusNovo ?? null,
      atorUserId: user.userId ?? null,
      atorRole: user.role,
      atorEmail: user.email,
      nota: data.nota ?? null,
      metadata: data.metadata ?? null,
    });
    await repo.save(event);
  }

  /**
   * Recalcula os totais (custo/receita) a partir das linhas e o imposto da nota
   * sobre a receita bruta: alíquota própria do chamado ou a vigente da empresa
   * (zero quando o chamado não emite nota).
   */
  private async recomputeTotals(manager: EntityManager, chamadoId: number) {
    const items = await manager.getRepository(ChamadoLineItem).find({
      where: { chamadoId },
    });
    const custo = sumMoney(
      items.filter((i) => i.natureza === 'custo').map((i) => i.valorTotal),
    );
    const receita = sumMoney(
      items.filter((i) => i.natureza === 'receita').map((i) => i.valorTotal),
    );
    const chamado = await manager.getRepository(Chamado).findOne({
      where: { id: chamadoId },
      select: { id: true, emiteNota: true, aliquotaImpostoManual: true },
    });
    const aliquota = chamado?.emiteNota
      ? (chamado.aliquotaImpostoManual ?? (await this.aliquotaVigente(manager)))
      : '0.00';
    await manager.getRepository(Chamado).update(chamadoId, {
      custoTecnicoTotal: custo,
      valorClienteTotal: receita,
      aliquotaImposto: aliquota,
      impostoTotal: percentOfMoney(receita, aliquota),
    });
  }

  /** Horas/km do chamado = soma das visitas finalizadas. */
  private async recomputeExecucao(manager: EntityManager, chamadoId: number) {
    const rows: { horas: string | null; km: string | null }[] =
      await manager.query(
        `SELECT SUM("horasTrabalhadas")::text AS horas, SUM("kmDeslocamento")::text AS km
         FROM "chamado_visitas"
         WHERE "chamadoId" = $1 AND "status" = 'finalizado'`,
        [chamadoId],
      );
    await manager.getRepository(Chamado).update(chamadoId, {
      horasTrabalhadas: rows[0]?.horas ?? null,
      kmDeslocamento: rows[0]?.km ?? null,
    });
  }

  /** Alíquota de imposto vigente da empresa (%), da linha única de config. */
  private async aliquotaVigente(manager: EntityManager): Promise<string> {
    const config = await manager
      .getRepository(FinanceiroConfig)
      .findOneBy({ id: FINANCEIRO_CONFIG_ID });
    return config?.aliquotaImposto ?? '0.00';
  }

  /** Lucro do chamado: receita bruta − imposto da nota − custo do técnico. */
  private margemDe(c: Chamado): string {
    return sumMoney([
      c.valorClienteTotal,
      `-${c.impostoTotal}`,
      `-${c.custoTecnicoTotal}`,
    ]);
  }

  /**
   * Aplica um campo de texto opcional de um DTO de edição: `undefined` mantém o
   * valor atual; string vazia (ou espaços) limpa (=> null); senão usa o novo.
   */
  private applyOptionalText(
    incoming: string | undefined,
    current: string | null,
  ): string | null {
    if (incoming === undefined) return current;
    const trimmed = incoming.trim();
    return trimmed.length ? trimmed : null;
  }

  /** Garante que o chamado não está com valores congelados (fechado). */
  private assertNaoCongelado(chamado: Chamado) {
    if (chamado.valoresCongeladosEm) {
      throw new ConflictException(
        'Chamado fechado: valores congelados. Reabra para alterar.',
      );
    }
  }

  /**
   * Projeta a visita atual no chamado. Os campos espelhados existem para que
   * lista/filtros/agenda/financeiro continuem lendo só `chamados`.
   *  - sem visita ou visita cancelada → chamado volta a `aberto` sem técnico
   *    (o agendamento pretendido é preservado para reagendar/reatribuir);
   *  - visita ativa/finalizada → status, técnico, snapshots e carimbos.
   * Não mexe em `fechado`/`cancelado`: quem chama decide esses estados.
   */
  private projetarVisita(chamado: Chamado, visita: ChamadoVisita | null) {
    chamado.visitaAtualId = visita?.id ?? null;
    if (!visita || visita.status === 'cancelado') {
      chamado.status = 'aberto';
      chamado.tecnicoUserId = null;
      chamado.techProfileId = null;
      chamado.snapTecnicoNome = null;
      chamado.snapTecnicoEmail = null;
      chamado.snapValorHora = null;
      chamado.snapCustoPorKm = null;
      chamado.snapCustoKmCidade = null;
      chamado.atribuidoEm = null;
      chamado.aCaminhoEm = null;
      chamado.chegadaEm = null;
      chamado.finalizadoEm = null;
      return;
    }
    chamado.status = visita.status;
    chamado.tecnicoUserId = visita.tecnicoUserId;
    chamado.techProfileId = visita.techProfileId;
    chamado.snapTecnicoNome = visita.snapTecnicoNome;
    chamado.snapTecnicoEmail = visita.snapTecnicoEmail;
    chamado.snapValorHora = visita.snapValorHora;
    chamado.snapCustoPorKm = visita.snapCustoPorKm;
    chamado.snapCustoKmCidade = visita.snapCustoKmCidade;
    chamado.agendadoPara = visita.agendadoPara;
    chamado.atribuidoEm = visita.atribuidoEm;
    chamado.aCaminhoEm = visita.aCaminhoEm;
    chamado.chegadaEm = visita.chegadaEm;
    chamado.finalizadoEm = visita.finalizadoEm;
  }

  /** Salva visita e chamado já projetado (nessa ordem). */
  private async salvarVisitaEChamado(
    manager: EntityManager,
    chamado: Chamado,
    visita: ChamadoVisita | null,
  ) {
    if (visita) await manager.getRepository(ChamadoVisita).save(visita);
    this.projetarVisita(chamado, visita);
    await manager.getRepository(Chamado).save(chamado);
  }

  /** Valida o técnico e congela identidade + tarifas para a cidade do chamado. */
  private async montarSnapshotTecnico(
    manager: EntityManager,
    tecnicoUserId: number,
    cityCode: number | null,
  ): Promise<SnapshotTecnico> {
    const tecnico = await manager.getRepository(User).findOne({
      where: { id: tecnicoUserId },
      relations: { techProfile: true },
    });
    if (!tecnico || !tecnico.isActive) {
      throw new BadRequestException('Técnico inválido ou inativo');
    }
    const profile = tecnico.techProfile;
    if (!profile) {
      throw new BadRequestException(
        'Usuário selecionado não é um técnico (sem perfil)',
      );
    }
    // Dados faltando => null (não falha).
    let snapCustoKmCidade: string | null = null;
    if (cityCode) {
      const area = await manager.getRepository(TechServiceArea).findOne({
        where: { techProfileId: profile.id, cityCode },
      });
      snapCustoKmCidade = area ? area.custoKm : null;
    }
    return {
      tecnico,
      techProfileId: profile.id,
      snapValorHora: parseBrMoney(profile.pretensaoValorHora),
      snapCustoPorKm: parseBrMoney(profile.custoPorKm),
      snapCustoKmCidade,
    };
  }

  private aplicarSnapshot(visita: ChamadoVisita, snap: SnapshotTecnico) {
    visita.tecnicoUserId = snap.tecnico.id;
    visita.techProfileId = snap.techProfileId;
    visita.snapTecnicoNome = snap.tecnico.name;
    visita.snapTecnicoEmail = snap.tecnico.email;
    visita.snapValorHora = snap.snapValorHora;
    visita.snapCustoPorKm = snap.snapCustoPorKm;
    visita.snapCustoKmCidade = snap.snapCustoKmCidade;
  }

  /** Prazo de aceite da solicitação (null quando a config não define). */
  private prazoSolicitacao(cfg: AppConfig): Date | null {
    if (!cfg.solicitacaoExpiraHoras) return null;
    return new Date(Date.now() + cfg.solicitacaoExpiraHoras * 3600_000);
  }

  private async proximoNumeroVisita(manager: EntityManager, chamadoId: number) {
    const rows: { max: number | null }[] = await manager.query(
      `SELECT MAX("numero") AS max FROM "chamado_visitas" WHERE "chamadoId" = $1`,
      [chamadoId],
    );
    return (Number(rows[0]?.max) || 0) + 1;
  }

  /** Linha de custo "chamada fixa" ligada à visita (opcional na atribuição). */
  private async inserirChamadaFixa(
    manager: EntityManager,
    chamado: Chamado,
    visita: ChamadoVisita,
    valor: string | undefined,
    user: AuthUser,
  ) {
    const chamadaFixa = parseBrMoney(valor);
    if (chamadaFixa && Number(chamadaFixa) > 0) {
      await manager.getRepository(ChamadoLineItem).insert({
        chamadoId: chamado.id,
        visitaId: visita.id,
        natureza: 'custo',
        tipo: 'servico',
        descricao: `Visita ${visita.numero} — Serviço fixo`,
        quantidade: '1',
        valorUnitario: chamadaFixa,
        valorTotal: chamadaFixa,
        origem: 'auto_snapshot',
        createdByUserId: user.userId,
      });
    }
  }

  /** Geolocalização: exige quando a config manda; devolve lat/lng ou nulls. */
  private exigirGeo(cfg: AppConfig, geo?: GeoDto) {
    if (cfg.geolocalizacaoObrigatoria && !geo) {
      throw new BadRequestException(
        'Geolocalização obrigatória: envie a posição do dispositivo',
      );
    }
    return {
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      precisaoM: geo?.precisaoM ?? null,
    };
  }

  /** Código de check-in/out exigido pelo cliente (quando o chamado tem um). */
  private exigirCodigo(esperado: string | null, informado?: string) {
    if (!esperado) return;
    if (!informado || informado.trim() !== esperado.trim()) {
      throw new ForbiddenException('Código de validação inválido');
    }
  }

  /** Alvo de notificação do cliente (e-mail cadastrado), se houver. */
  private async clienteTarget(manager: EntityManager, clientId: number) {
    const client = await manager.getRepository(Client).findOne({
      where: { id: clientId },
      select: { id: true, nome: true, email: true },
    });
    if (!client?.email) return null;
    return { email: client.email, name: client.nome };
  }

  /** Gestores (super_admin ativos) como alvos de notificação. */
  private async adminsTargets(manager: EntityManager) {
    const admins = await manager.getRepository(User).find({
      where: { role: { name: ROLE_SUPER_ADMIN }, isActive: true },
    });
    return admins.map((a) => ({ email: a.email, name: a.name, userId: a.id }));
  }

  /** Aplica a política de SLA (prazos a partir da abertura) ao chamado. */
  private async aplicarSla(chamado: Chamado) {
    const politica = await this.config.resolveSla(
      chamado.clientId,
      chamado.prioridade,
    );
    const base = (chamado.createdAt ?? new Date()).getTime();
    chamado.slaPoliticaId = politica?.id ?? null;
    chamado.prazoPrimeiraVisita = politica?.horasPrimeiraVisita
      ? new Date(base + politica.horasPrimeiraVisita * 3600_000)
      : null;
    chamado.prazoConclusao = politica?.horasConclusao
      ? new Date(base + politica.horasConclusao * 3600_000)
      : null;
  }

  private infoDe(chamado: Chamado) {
    return {
      id: chamado.id,
      codigo: chamado.codigo,
      titulo: chamado.titulo,
      status: chamado.status,
    };
  }

  // ============================================================ leitura

  /**
   * Agenda (calendário): visitas com `agendadoPara` no intervalo [de, ate]
   * (datas locais em America/Sao_Paulo) + chamados abertos ainda sem visita
   * ativa mas com agendamento pretendido. Payload enxuto, sem financeiro.
   * Intervalo máximo: 92 dias.
   */
  async agenda(query: AgendaQueryDto, user: AuthUser) {
    const de = new Date(query.de);
    const ate = new Date(query.ate);
    const DIAS_MAX = 92;
    const diffMs = ate.getTime() - de.getTime();
    if (diffMs < 0 || diffMs > DIAS_MAX * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        `O intervalo de datas deve ser entre 0 e ${DIAS_MAX} dias`,
      );
    }

    // 1) Visitas (todas as não canceladas, inclusive anteriores à atual).
    const vq = this.visitaRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.chamado', 'c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.city', 'city')
      .where('v.agendadoPara IS NOT NULL')
      .andWhere("v.status <> 'cancelado'");
    this.applyTecnicoScope(vq, user, 'v');
    this.applyDateRange(vq, 'v.agendadoPara', query.de, query.ate);
    if (query.status?.length) {
      vq.andWhere('v.status IN (:...statuses)', { statuses: query.status });
    }
    if (query.prioridade?.length) {
      vq.andWhere('c.prioridade IN (:...prios)', { prios: query.prioridade });
    }
    if (query.clientId) {
      vq.andWhere('c.clientId = :cid', { cid: query.clientId });
    }
    if (query.tecnicoUserIds?.length && this.isGerente(user)) {
      vq.andWhere('v.tecnicoUserId IN (:...tids)', {
        tids: query.tecnicoUserIds,
      });
    }
    const visitas = await vq.getMany();

    interface AgendaItem {
      id: number;
      visitaId: number | null;
      numero: number | null;
      codigo: string;
      titulo: string;
      status: string;
      prioridade: string;
      agendadoPara: Date | null;
      duracaoPrevistaMin: number | null;
      ordemRota: number | null;
      clienteNome: string | null;
      tecnicoNome: string | null;
      tecnicoUserId: number | null;
      cidadeNome: string | null;
      uf: string | null;
      logradouro: string | null;
      numeroEndereco: string | null;
      bairro: string | null;
    }

    const items: AgendaItem[] = visitas.map((v) => ({
      id: v.chamado.id,
      visitaId: v.id,
      numero: v.numero,
      codigo: v.chamado.codigo,
      titulo: v.chamado.titulo,
      status: v.status,
      prioridade: v.chamado.prioridade,
      agendadoPara: v.agendadoPara,
      duracaoPrevistaMin: v.duracaoPrevistaMin,
      ordemRota: v.ordemRota,
      clienteNome: v.chamado.client?.nome ?? null,
      tecnicoNome: v.snapTecnicoNome,
      tecnicoUserId: v.tecnicoUserId,
      cidadeNome: v.chamado.city?.nome ?? null,
      uf: v.chamado.city?.uf ?? null,
      logradouro: v.chamado.logradouro,
      numeroEndereco: v.chamado.numero,
      bairro: v.chamado.bairro,
    }));

    // 2) Chamados abertos sem visita ativa (só o gestor os vê — não têm técnico).
    const semTecnicoFiltro =
      !query.tecnicoUserIds?.length &&
      (!query.status?.length || query.status.includes('aberto'));
    if (this.isGerente(user) && semTecnicoFiltro) {
      const cq = this.chamadoRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.client', 'client')
        .leftJoinAndSelect('c.city', 'city')
        .leftJoin(ChamadoVisita, 'va', 'va.id = c.visitaAtualId')
        .where("c.status = 'aberto'")
        .andWhere('c.agendadoPara IS NOT NULL')
        .andWhere("(va.id IS NULL OR va.status = 'cancelado')");
      this.applyDateRange(cq, 'c.agendadoPara', query.de, query.ate);
      if (query.prioridade?.length) {
        cq.andWhere('c.prioridade IN (:...prios)', {
          prios: query.prioridade,
        });
      }
      if (query.clientId) {
        cq.andWhere('c.clientId = :cid', { cid: query.clientId });
      }
      const abertos = await cq.getMany();
      for (const c of abertos) {
        items.push({
          id: c.id,
          visitaId: null,
          numero: null,
          codigo: c.codigo,
          titulo: c.titulo,
          status: 'aberto',
          prioridade: c.prioridade,
          agendadoPara: c.agendadoPara,
          duracaoPrevistaMin: null,
          ordemRota: null,
          clienteNome: c.client?.nome ?? null,
          tecnicoNome: null,
          tecnicoUserId: null,
          cidadeNome: c.city?.nome ?? null,
          uf: c.city?.uf ?? null,
          logradouro: c.logradouro,
          numeroEndereco: c.numero,
          bairro: c.bairro,
        });
      }
    }

    items.sort(
      (a, b) =>
        (a.agendadoPara?.getTime() ?? 0) - (b.agendadoPara?.getTime() ?? 0) ||
        a.id - b.id,
    );
    // Compatibilidade: `numero` era o número do endereço no payload antigo.
    return items.map(({ numeroEndereco, numero, ...rest }) => ({
      ...rest,
      visitaNumero: numero,
      numero: numeroEndereco,
    }));
  }

  /**
   * Rota do dia do técnico: visitas não canceladas agendadas na data (local),
   * ordenadas por `ordemRota` e horário. Gestor pode consultar outro técnico.
   */
  async minhaRota(query: MinhaRotaQueryDto, user: AuthUser) {
    const tecnicoUserId =
      this.isGerente(user) && query.tecnicoUserId
        ? query.tecnicoUserId
        : user.userId;
    const data = query.data.slice(0, 10);
    const visitas = await this.visitaRepo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.chamado', 'c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.city', 'city')
      .where('v.tecnicoUserId = :tid', { tid: tecnicoUserId })
      .andWhere("v.status <> 'cancelado'")
      .andWhere(
        `(v.agendadoPara AT TIME ZONE 'America/Sao_Paulo')::date = :data`,
        { data },
      )
      .orderBy('v.ordemRota', 'ASC', 'NULLS LAST')
      .addOrderBy('v.agendadoPara', 'ASC')
      .addOrderBy('v.id', 'ASC')
      .getMany();

    return visitas.map((v) => ({
      visita: this.serializeVisita(v),
      chamado: {
        id: v.chamado.id,
        codigo: v.chamado.codigo,
        titulo: v.chamado.titulo,
        descricao: v.chamado.descricao,
        prioridade: v.chamado.prioridade,
        status: v.chamado.status,
        clienteNome: v.chamado.client?.nome ?? null,
        clienteTelefone: v.chamado.client?.telefone ?? null,
        cidadeNome: v.chamado.city?.nome ?? null,
        uf: v.chamado.city?.uf ?? null,
        cep: v.chamado.cep,
        logradouro: v.chamado.logradouro,
        numero: v.chamado.numero,
        complemento: v.chamado.complemento,
        bairro: v.chamado.bairro,
        pontoReferencia: v.chamado.pontoReferencia,
        latitude: v.chamado.latitude,
        longitude: v.chamado.longitude,
        contatoLocalNome: v.chamado.contatoLocalNome,
        contatoLocalTelefone: v.chamado.contatoLocalTelefone,
        exigeCodigoCheckin: !!v.chamado.codigoCheckin,
        exigeCodigoCheckout: !!v.chamado.codigoCheckout,
        prazoPrimeiraVisita: v.chamado.prazoPrimeiraVisita,
        prazoConclusao: v.chamado.prazoConclusao,
        slaPrimeiraVisitaEstourado: this.slaEstourado(
          v.chamado,
          'primeiraVisita',
        ),
        slaConclusaoEstourado: this.slaEstourado(v.chamado, 'conclusao'),
      },
    }));
  }

  /** Reordena a visita na rota do dia do técnico. */
  async definirOrdemRota(
    id: number,
    visitaId: number,
    ordemRota: number | null,
    user: AuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.loadOrFail(id, manager);
      const visita = await manager
        .getRepository(ChamadoVisita)
        .findOneBy({ id: visitaId, chamadoId: id });
      if (!visita) throw new NotFoundException('Visita não encontrada');
      if (!this.isGerente(user) && visita.tecnicoUserId !== user.userId) {
        throw new NotFoundException('Visita não encontrada');
      }
      visita.ordemRota = ordemRota;
      await manager.getRepository(ChamadoVisita).save(visita);
      return this.serializeVisita(visita);
    });
  }

  /**
   * Reagenda a visita atual (ou o agendamento pretendido do chamado quando
   * ainda não há visita ativa). Bloqueado se fechado/cancelado.
   */
  async reagendar(id: number, agendadoPara: string | null, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);

      if (!this.isGerente(user) && chamado.tecnicoUserId !== user.userId) {
        throw new NotFoundException('Chamado não encontrado');
      }
      if (['fechado', 'cancelado'].includes(chamado.status)) {
        throw new ConflictException(
          'Chamado fechado/cancelado não pode ser reagendado',
        );
      }
      const novo = agendadoPara ? new Date(agendadoPara) : null;
      await this.assertAgendamentoPermitido(novo);

      const anterior = chamado.agendadoPara;
      const visita = await this.loadVisitaAtual(manager, chamado);
      if (visita && VISITA_STATUS_ATIVOS.includes(visita.status)) {
        visita.agendadoPara = novo;
        await this.salvarVisitaEChamado(manager, chamado, visita);
      } else {
        chamado.agendadoPara = novo;
        await manager.getRepository(Chamado).save(chamado);
      }

      await this.logEvent(manager, id, user, {
        tipo: 'editado',
        metadata: {
          agendadoAntes: anterior,
          agendadoDepois: novo,
          visitaId: visita?.id ?? null,
        },
      });

      return { id: chamado.id, agendadoPara: novo };
    });
  }

  /** Config `permitirAgendarNoPassado`: bloqueia datas passadas quando desligada. */
  private async assertAgendamentoPermitido(data: Date | null) {
    if (!data) return;
    const cfg = await this.config.get();
    if (!cfg.permitirAgendarNoPassado && data.getTime() < Date.now()) {
      throw new BadRequestException(
        'Agendamento no passado não é permitido pela configuração',
      );
    }
  }

  async list(query: ListChamadosQueryDto, user: AuthUser) {
    const qb = this.chamadoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.city', 'city')
      // id como desempate garante ordem total e paginação estável.
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'DESC');

    this.applyTecnicoScope(qb, user);

    if (query.solicitacaoPendente === true) {
      // Tela de Solicitações: só chamados aguardando aceite do técnico.
      qb.andWhere("c.status = 'solicitado'");
    } else {
      // Chamados "solicitados" ficam OCULTOS do técnico em /chamados — ele os
      // vê apenas na tela de Solicitações. O gestor continua enxergando.
      if (!this.isGerente(user)) {
        qb.andWhere("c.status <> 'solicitado'");
      }
      if (query.status?.length)
        qb.andWhere('c.status IN (:...statuses)', { statuses: query.status });
    }
    if (query.prioridade?.length)
      qb.andWhere('c.prioridade IN (:...prios)', { prios: query.prioridade });
    if (query.clientId)
      qb.andWhere('c.clientId = :cid', { cid: query.clientId });
    if (query.servicoId)
      qb.andWhere('c.servicoId = :sid', { sid: query.servicoId });
    if (!query.incluirArquivados) qb.andWhere('c.arquivadoEm IS NULL');
    if (query.slaEstourado) {
      qb.andWhere(
        `c.status NOT IN ('fechado','cancelado') AND (
           c.slaPrimeiraVisitaViolado = true OR c.slaConclusaoViolado = true
           OR (c.prazoPrimeiraVisita < now() AND c.primeiraVisitaEm IS NULL)
           OR (c.prazoConclusao < now() AND c.finalizadoEm IS NULL))`,
      );
    }
    // Filtro por técnicos (multi) só vale para gerentes (técnico já é escopado).
    if (query.tecnicoUserIds?.length && this.isGerente(user))
      qb.andWhere('c.tecnicoUserId IN (:...tids)', {
        tids: query.tecnicoUserIds,
      });

    // Intervalos de data (inclusivos: até o fim do dia "ate").
    this.applyDateRange(qb, 'c.createdAt', query.criadoDe, query.criadoAte);
    this.applyDateRange(
      qb,
      'c.agendadoPara',
      query.agendadoDe,
      query.agendadoAte,
    );
    this.applyDateRange(
      qb,
      'c.finalizadoEm',
      query.finalizadoDe,
      query.finalizadoAte,
    );

    if (query.search)
      qb.andWhere(
        `(c.titulo ILIKE :s OR c.codigo ILIKE :s OR client.nome ILIKE :s
          OR c.chamadoExterno ILIKE :s OR c.chamadoInterno ILIKE :s
          OR c.snapTecnicoNome ILIKE :s)`,
        { s: `%${query.search}%` },
      );

    // Paginação (default 50; 50/100/200 validados no DTO).
    const pageSize = query.pageSize ?? 50;
    const page = query.page && query.page > 0 ? query.page : 1;
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((c) =>
        this.serialize(c, user, { includeLineItems: false }),
      ),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Aplica um intervalo [de, ate] (datas YYYY-MM-DD, inclusivas) a uma coluna
   * timestamptz, comparando pelo DIA no fuso America/Sao_Paulo — evita o
   * deslocamento de ~3h que ocorreria se a sessão do Postgres estivesse em UTC.
   */
  private applyDateRange<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    column: string,
    de?: string,
    ate?: string,
  ) {
    // Sufixo único por coluna para não colidir os parâmetros.
    const key = column.replace(/\W/g, '');
    const localDate = `(${column} AT TIME ZONE 'America/Sao_Paulo')::date`;
    if (de) {
      qb.andWhere(`${localDate} >= :${key}De`, { [`${key}De`]: de });
    }
    if (ate) {
      qb.andWhere(`${localDate} <= :${key}Ate`, { [`${key}Ate`]: ate });
    }
  }

  async findOne(id: number, user: AuthUser) {
    const qb = this.chamadoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.client', 'client')
      .leftJoinAndSelect('c.city', 'city')
      .leftJoinAndSelect('c.tecnicoUser', 'tecnicoUser')
      .leftJoinAndSelect('c.lineItems', 'li')
      .leftJoinAndSelect('c.rats', 'rats')
      .leftJoinAndSelect('c.visitas', 'v')
      .leftJoinAndSelect('v.pausas', 'vp')
      .leftJoinAndSelect('c.servico', 'servico')
      .where('c.id = :id', { id })
      .orderBy('v.numero', 'ASC')
      .addOrderBy('vp.inicioEm', 'ASC');
    this.applyTecnicoScope(qb, user);

    const chamado = await qb.getOne();
    // NotFound (não Forbidden) fora do escopo — não vaza existência.
    if (!chamado) throw new NotFoundException('Chamado não encontrado');

    // "Visualizado": 1ª abertura pelo técnico dono da visita atual.
    const atual = chamado.visitas?.find((v) => v.id === chamado.visitaAtualId);
    if (
      atual &&
      atual.tecnicoUserId === user.userId &&
      !atual.visualizadoEm &&
      VISITA_STATUS_ATIVOS.includes(atual.status)
    ) {
      atual.visualizadoEm = new Date();
      void this.visitaRepo
        .update(atual.id, { visualizadoEm: atual.visualizadoEm })
        .catch((e) =>
          this.logger.warn(
            `Falha ao marcar visualização: ${(e as Error).message}`,
          ),
        );
    }
    return this.serialize(chamado, user, { includeLineItems: true });
  }

  async listVisitas(id: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const visitas = await this.visitaRepo.find({
      where: { chamadoId: id },
      relations: { pausas: true },
      order: { numero: 'ASC', pausas: { inicioEm: 'ASC' } },
    });
    return visitas.map((v) => this.serializeVisita(v));
  }

  async listEventos(id: number, user: AuthUser) {
    // Garante escopo (findOne lança se fora do escopo do técnico).
    await this.assertAcessible(id, user);
    const eventos = await this.dataSource.getRepository(ChamadoEvent).find({
      where: { chamadoId: id },
      order: { createdAt: 'DESC' },
    });
    const podeFin = user.permissions.includes(PERM_FIN_VER);
    return eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      statusAnterior: e.statusAnterior,
      statusNovo: e.statusNovo,
      atorEmail: e.atorEmail,
      atorRole: e.atorRole,
      nota: e.nota,
      // metadata pode conter RECEITA (inclusive em objetos aninhados de linhas).
      // Sem financeiro.ver, não expomos metadata de eventos financeiros.
      metadata: podeFin ? e.metadata : this.safeMetadata(e),
      createdAt: e.createdAt,
    }));
  }

  async listRats(id: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    return this.ratRepo.find({
      where: { chamadoId: id },
      order: { createdAt: 'DESC' },
    });
  }

  private async assertAcessible(id: number, user: AuthUser) {
    const qb = this.chamadoRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id });
    this.applyTecnicoScope(qb, user);
    const exists = await qb.getExists();
    if (!exists) throw new NotFoundException('Chamado não encontrado');
  }

  // ============================================================ criação

  /** Local do cliente (ativo) para copiar endereço/coords/contato. */
  private async loadLocalDoCliente(
    manager: EntityManager,
    clientId: number,
    localId: number,
  ) {
    const local = await manager
      .getRepository(ClientLocal)
      .findOneBy({ id: localId, clientId });
    if (!local) {
      throw new BadRequestException('Local inválido para este cliente');
    }
    return local;
  }

  async create(dto: CreateChamadoDto, user: AuthUser) {
    const client = await this.dataSource
      .getRepository(Client)
      .findOne({ where: { id: dto.clientId }, relations: { city: true } });
    if (!client) throw new BadRequestException('Cliente inválido');
    const agendadoPara = dto.agendadoPara ? new Date(dto.agendadoPara) : null;
    await this.assertAgendamentoPermitido(agendadoPara);
    const servico = dto.servicoId
      ? await this.servicos.findOne(dto.servicoId)
      : null;
    const titulo = dto.titulo?.trim() || servico?.nome;
    if (!titulo) {
      throw new BadRequestException('Informe o título ou um serviço');
    }

    return this.dataSource.transaction(async (manager) => {
      const seq: { n: string }[] = await manager.query(
        `SELECT nextval('chamados_codigo_seq') AS n`,
      );
      const codigo = `CH-${String(seq[0].n).padStart(6, '0')}`;

      // Fonte do endereço: local informado > cliente. Campos do DTO prevalecem.
      const local = dto.localId
        ? await this.loadLocalDoCliente(manager, client.id, dto.localId)
        : null;
      const base = local ?? client;

      const chamado = manager.getRepository(Chamado).create({
        codigo,
        clientId: client.id,
        localId: local?.id ?? null,
        cityCode: dto.cityCode ?? base.cityCode ?? client.cityCode ?? null,
        cep: dto.cep ?? base.cep ?? null,
        logradouro: dto.logradouro ?? base.logradouro ?? null,
        numero: dto.numero ?? base.numero ?? null,
        complemento: dto.complemento ?? base.complemento ?? null,
        bairro: dto.bairro ?? base.bairro ?? null,
        pontoReferencia: dto.pontoReferencia ?? local?.pontoReferencia ?? null,
        latitude: dto.latitude ?? local?.latitude ?? null,
        longitude: dto.longitude ?? local?.longitude ?? null,
        contatoLocalNome:
          dto.contatoLocalNome ?? local?.contatoNome ?? client.contatoNome,
        contatoLocalTelefone:
          dto.contatoLocalTelefone ?? local?.contatoTelefone ?? null,
        codigoCheckin: dto.codigoCheckin ?? local?.codigoCheckin ?? null,
        codigoCheckout: dto.codigoCheckout ?? local?.codigoCheckout ?? null,
        titulo,
        servicoId: servico?.id ?? null,
        descricao: dto.descricao ?? servico?.descricao ?? null,
        chamadoInterno: dto.chamadoInterno ?? null,
        chamadoExterno: dto.chamadoExterno ?? null,
        prioridade: dto.prioridade ?? 'media',
        status: 'aberto',
        agendadoPara,
        // Nota fiscal: padrão do cliente (ajustável no financeiro do chamado).
        emiteNota: client.emiteNotaFiscal,
        createdByUserId: user.userId,
      });
      await this.aplicarSla(chamado);
      const saved = await manager.getRepository(Chamado).save(chamado);
      // Materializa a alíquota vigente já na criação.
      await this.recomputeTotals(manager, saved.id);
      await this.logEvent(manager, saved.id, user, {
        tipo: 'criado',
        statusNovo: 'aberto',
      });
      return this.findOneTx(manager, saved.id, user);
    });
  }

  async update(id: number, dto: UpdateChamadoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      // Escopo: técnico só edita o PRÓPRIO chamado (NotFound p/ não vazar
      // existência, como no findOne). Gerente edita qualquer um.
      if (!this.isGerente(user) && chamado.tecnicoUserId !== user.userId) {
        throw new NotFoundException('Chamado não encontrado');
      }
      if (['fechado', 'cancelado'].includes(chamado.status)) {
        throw new ConflictException(
          'Chamado fechado/cancelado não pode ser editado',
        );
      }

      // Trocar a cidade após atribuição re-congela o snapshot de custo/km —
      // ação financeiramente relevante, restrita a gerente.
      if (
        dto.cityCode !== undefined &&
        dto.cityCode !== chamado.cityCode &&
        chamado.tecnicoUserId &&
        !this.isGerente(user)
      ) {
        throw new ForbiddenException(
          'Somente gestor pode trocar a cidade após a atribuição',
        );
      }

      const before = {
        cityCode: chamado.cityCode,
        prioridade: chamado.prioridade,
      };
      if (dto.servicoId !== undefined) {
        chamado.servicoId = dto.servicoId
          ? (await this.servicos.findOne(dto.servicoId)).id
          : null;
      }

      // Trocar o local copia o endereço dele; campos do DTO prevalecem abaixo.
      if (dto.localId !== undefined) {
        if (dto.localId === null) {
          chamado.localId = null;
        } else if (dto.localId !== chamado.localId) {
          const local = await this.loadLocalDoCliente(
            manager,
            chamado.clientId,
            dto.localId,
          );
          Object.assign(chamado, {
            localId: local.id,
            cep: local.cep,
            logradouro: local.logradouro,
            numero: local.numero,
            complemento: local.complemento,
            bairro: local.bairro,
            pontoReferencia: local.pontoReferencia,
            latitude: local.latitude,
            longitude: local.longitude,
            contatoLocalNome: local.contatoNome,
            contatoLocalTelefone: local.contatoTelefone,
            codigoCheckin: local.codigoCheckin,
            codigoCheckout: local.codigoCheckout,
          });
          if (local.cityCode && dto.cityCode === undefined) {
            dto.cityCode = local.cityCode;
          }
        }
      }

      // Campos de texto opcionais: `undefined` mantém; vazio/null limpa.
      Object.assign(chamado, {
        titulo: dto.titulo ?? chamado.titulo,
        descricao: this.applyOptionalText(dto.descricao, chamado.descricao),
        chamadoInterno: this.applyOptionalText(
          dto.chamadoInterno,
          chamado.chamadoInterno,
        ),
        chamadoExterno: this.applyOptionalText(
          dto.chamadoExterno,
          chamado.chamadoExterno,
        ),
        prioridade: dto.prioridade ?? chamado.prioridade,
        cep: this.applyOptionalText(dto.cep, chamado.cep),
        logradouro: this.applyOptionalText(dto.logradouro, chamado.logradouro),
        numero: this.applyOptionalText(dto.numero, chamado.numero),
        complemento: this.applyOptionalText(
          dto.complemento,
          chamado.complemento,
        ),
        bairro: this.applyOptionalText(dto.bairro, chamado.bairro),
        pontoReferencia: this.applyOptionalText(
          dto.pontoReferencia,
          chamado.pontoReferencia,
        ),
        contatoLocalNome: this.applyOptionalText(
          dto.contatoLocalNome,
          chamado.contatoLocalNome,
        ),
        contatoLocalTelefone: this.applyOptionalText(
          dto.contatoLocalTelefone,
          chamado.contatoLocalTelefone,
        ),
        codigoCheckin: this.applyOptionalText(
          dto.codigoCheckin,
          chamado.codigoCheckin,
        ),
        codigoCheckout: this.applyOptionalText(
          dto.codigoCheckout,
          chamado.codigoCheckout,
        ),
        latitude: dto.latitude === undefined ? chamado.latitude : dto.latitude,
        longitude:
          dto.longitude === undefined ? chamado.longitude : dto.longitude,
      });

      const cidadeMudou =
        dto.cityCode !== undefined && dto.cityCode !== chamado.cityCode;
      if (dto.cityCode !== undefined) chamado.cityCode = dto.cityCode;

      // Prioridade alterada antes da 1ª visita: re-resolve a política de SLA.
      if (
        chamado.prioridade !== before.prioridade &&
        !chamado.primeiraVisitaEm
      ) {
        await this.aplicarSla(chamado);
      }

      const visita = await this.loadVisitaAtual(manager, chamado);
      const visitaAtiva =
        visita && VISITA_STATUS_ATIVOS.includes(visita.status) ? visita : null;

      // Re-congela o custo por km da nova cidade se já havia técnico.
      if (cidadeMudou && visitaAtiva?.techProfileId) {
        const area = await manager.getRepository(TechServiceArea).findOne({
          where: {
            techProfileId: visitaAtiva.techProfileId,
            cityCode: chamado.cityCode ?? undefined,
          },
        });
        visitaAtiva.snapCustoKmCidade = area ? area.custoKm : null;
      }

      // `undefined` mantém; `null`/'' limpa o agendamento.
      if (dto.agendadoPara !== undefined) {
        const novo = dto.agendadoPara ? new Date(dto.agendadoPara) : null;
        await this.assertAgendamentoPermitido(novo);
        if (visitaAtiva) visitaAtiva.agendadoPara = novo;
        else chamado.agendadoPara = novo;
      }

      if (visitaAtiva) {
        await this.salvarVisitaEChamado(manager, chamado, visitaAtiva);
      } else {
        await manager.getRepository(Chamado).save(chamado);
      }
      await this.logEvent(manager, id, user, {
        tipo: 'editado',
        metadata: cidadeMudou
          ? { cidadeAntes: before.cityCode, cidadeDepois: chamado.cityCode }
          : null,
      });
      return this.findOneTx(manager, id, user);
    });
  }

  async remove(id: number) {
    const chamado = await this.loadOrFail(id);
    if (!['aberto', 'fechado'].includes(chamado.status)) {
      throw new ConflictException(
        'Só é possível excluir chamados abertos ou fechados',
      );
    }
    const rats = await this.ratRepo.find({ where: { chamadoId: id } });
    const visitas = await this.visitaRepo.find({ where: { chamadoId: id } });
    const paths = [
      ...rats.map((r) => r.storagePath),
      ...visitas.map((v) => v.assinaturaPath).filter((p): p is string => !!p),
    ];
    await this.chamadoRepo.remove(chamado);
    for (const path of paths) {
      try {
        await this.storage.remove(path);
      } catch (e) {
        this.logger.warn(
          `Chamado ${id} excluído, mas objeto ${path} não foi apagado: ${(e as Error).message}`,
        );
      }
    }
    return { success: true };
  }

  // ============================================================ visitas

  /**
   * Cria uma visita `solicitado` para o técnico (1ª visita ou retorno). Usada
   * por `atribuir` (chamado aberto) e por `criarVisita` (retorno). O chamado
   * precisa estar sem visita ativa e não pode estar fechado/cancelado.
   */
  private async novaVisita(
    manager: EntityManager,
    chamado: Chamado,
    dto: CreateVisitaDto,
    user: AuthUser,
    tipoEvento: 'atribuido' | 'visita_criada',
  ) {
    if (['fechado', 'cancelado'].includes(chamado.status)) {
      throw new ConflictException(
        `Ação inválida para o status atual (${chamado.status})`,
      );
    }
    const atual = await this.loadVisitaAtual(manager, chamado);
    if (atual && VISITA_STATUS_ATIVOS.includes(atual.status)) {
      throw new ConflictException(
        'Já existe uma visita em andamento. Reatribua ou cancele-a antes.',
      );
    }
    const cfg = await this.config.get();
    const agendadoPara = dto.agendadoPara
      ? new Date(dto.agendadoPara)
      : (chamado.agendadoPara ?? null);
    await this.assertAgendamentoPermitido(agendadoPara);

    const snap = await this.montarSnapshotTecnico(
      manager,
      dto.tecnicoUserId,
      chamado.cityCode,
    );
    const numero = await this.proximoNumeroVisita(manager, chamado.id);
    const visita = manager.getRepository(ChamadoVisita).create({
      chamadoId: chamado.id,
      numero,
      status: 'solicitado',
      agendadoPara,
      duracaoPrevistaMin:
        dto.duracaoPrevistaMin ??
        (chamado.servicoId
          ? (await this.servicos.findOne(chamado.servicoId)).duracaoPadraoMin
          : null),
      observacao: dto.observacao ?? null,
      atribuidoEm: new Date(),
      solicitacaoExpiraEm: this.prazoSolicitacao(cfg),
      createdByUserId: user.userId,
    });
    this.aplicarSnapshot(visita, snap);
    const statusAnterior = chamado.status;
    await this.salvarVisitaEChamado(manager, chamado, visita);

    await this.inserirChamadaFixa(
      manager,
      chamado,
      visita,
      dto.chamadaFixa,
      user,
    );
    await this.recomputeTotals(manager, chamado.id);

    await this.logEvent(manager, chamado.id, user, {
      tipo: tipoEvento,
      statusAnterior,
      statusNovo: 'solicitado',
      metadata: {
        visitaId: visita.id,
        visitaNumero: numero,
        tecnicoUserId: snap.tecnico.id,
        agendadoPara,
        snapValorHora: snap.snapValorHora,
        snapCustoPorKm: snap.snapCustoPorKm,
        snapCustoKmCidade: snap.snapCustoKmCidade,
      },
    });

    // Notifica APÓS o commit (fora da transação) — ver wrapper abaixo.
    this.notifyAfter(() =>
      this.notifier.notifyChamadoAtribuido(this.infoDe(chamado), {
        email: snap.tecnico.email,
        name: snap.tecnico.name,
        userId: snap.tecnico.id,
      }),
    );
    return visita;
  }

  /** Nova visita (retorno) após a atual ter sido finalizada/cancelada. Gestor. */
  async criarVisita(id: number, dto: CreateVisitaDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      await this.novaVisita(manager, chamado, dto, user, 'visita_criada');
      return this.findOneTx(manager, id, user);
    });
  }

  /**
   * Atribui/reatribui técnico. Chamado sem visita ativa → cria a visita;
   * com visita ativa → troca o técnico da MESMA visita (snapshot refeito,
   * progresso e linhas auto da visita descartados).
   */
  async atribuir(id: number, dto: AtribuirDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      const visita = await this.loadVisitaAtual(manager, chamado);

      if (!visita || !VISITA_STATUS_ATIVOS.includes(visita.status)) {
        if (chamado.status !== 'aberto') {
          throw new ConflictException(
            `Ação inválida para o status atual (${chamado.status})`,
          );
        }
        await this.novaVisita(manager, chamado, dto, user, 'atribuido');
        return this.findOneTx(manager, id, user);
      }

      // Reatribuição da visita em andamento.
      const cfg = await this.config.get();
      const snap = await this.montarSnapshotTecnico(
        manager,
        dto.tecnicoUserId,
        chamado.cityCode,
      );
      const statusAnterior = chamado.status;
      this.aplicarSnapshot(visita, snap);
      visita.status = 'solicitado';
      visita.atribuidoEm = new Date();
      visita.solicitacaoExpiraEm = this.prazoSolicitacao(cfg);
      visita.aceitoEm = null;
      visita.visualizadoEm = null;
      visita.aCaminhoEm = null;
      visita.chegadaEm = null;
      visita.aCaminhoLat = visita.aCaminhoLng = null;
      visita.chegadaLat = visita.chegadaLng = null;
      visita.chegadaPrecisaoM = visita.chegadaDistanciaM = null;
      if (dto.agendadoPara !== undefined) {
        const novo = dto.agendadoPara ? new Date(dto.agendadoPara) : null;
        await this.assertAgendamentoPermitido(novo);
        visita.agendadoPara = novo;
      }
      if (dto.duracaoPrevistaMin !== undefined) {
        visita.duracaoPrevistaMin = dto.duracaoPrevistaMin;
      }
      await this.salvarVisitaEChamado(manager, chamado, visita);

      // Pausas em curso e linhas auto desta visita dependem do técnico anterior.
      await manager
        .getRepository(ChamadoVisitaPausa)
        .delete({ visitaId: visita.id });
      await manager.getRepository(ChamadoLineItem).delete({
        chamadoId: id,
        origem: 'auto_snapshot',
        visitaId: visita.id,
      });
      await this.inserirChamadaFixa(
        manager,
        chamado,
        visita,
        dto.chamadaFixa,
        user,
      );
      await this.recomputeTotals(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: 'reatribuido',
        statusAnterior,
        statusNovo: 'solicitado',
        metadata: {
          visitaId: visita.id,
          visitaNumero: visita.numero,
          tecnicoUserId: snap.tecnico.id,
          snapValorHora: snap.snapValorHora,
          snapCustoPorKm: snap.snapCustoPorKm,
          snapCustoKmCidade: snap.snapCustoKmCidade,
        },
      });

      this.notifyAfter(() =>
        this.notifier.notifyChamadoAtribuido(this.infoDe(chamado), {
          email: snap.tecnico.email,
          name: snap.tecnico.name,
          userId: snap.tecnico.id,
        }),
      );
      return this.findOneTx(manager, id, user);
    });
  }

  /**
   * Encerra a visita atual SEM execução (recusa do técnico, remoção pelo
   * gestor, expiração): visita cancelada, linhas auto dela descartadas e o
   * chamado volta a `aberto` (agendamento pretendido preservado).
   */
  private async encerrarVisitaSemExecucao(
    manager: EntityManager,
    chamado: Chamado,
    visita: ChamadoVisita,
    user: AuthUser,
    evento: {
      tipo: string;
      nota: string | null;
      motivoId?: number | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const statusAnterior = chamado.status;
    visita.status = 'cancelado';
    visita.canceladoEm = new Date();
    visita.motivoCancelamento = evento.nota;
    visita.motivoId = evento.motivoId ?? null;
    await this.salvarVisitaEChamado(manager, chamado, visita);

    await manager.getRepository(ChamadoLineItem).delete({
      chamadoId: chamado.id,
      origem: 'auto_snapshot',
      visitaId: visita.id,
    });
    await manager
      .getRepository(ChamadoVisitaPausa)
      .delete({ visitaId: visita.id });
    await this.recomputeTotals(manager, chamado.id);

    await this.logEvent(manager, chamado.id, user, {
      tipo: evento.tipo,
      statusAnterior,
      statusNovo: 'aberto',
      nota: evento.nota,
      metadata: {
        visitaId: visita.id,
        visitaNumero: visita.numero,
        motivoId: evento.motivoId ?? null,
        ...(evento.metadata ?? {}),
      },
    });
  }

  /** Remove o técnico da visita em andamento (volta para "aberto"). Só gestor. */
  async desatribuir(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      const visita = await this.visitaAtualOrFail(
        manager,
        chamado,
        VISITA_STATUS_ATIVOS,
      );
      const tecnicoRemovidoId = visita.tecnicoUserId;
      await this.encerrarVisitaSemExecucao(manager, chamado, visita, user, {
        tipo: 'desatribuido',
        nota: null,
        metadata: { tecnicoRemovidoId },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  /** Cancela a visita atual (gestor), mantendo o chamado aberto para nova visita. */
  async cancelarVisita(
    id: number,
    visitaId: number,
    dto: MotivoDto,
    user: AuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      if (chamado.visitaAtualId !== visitaId) {
        throw new ConflictException('Só a visita atual pode ser cancelada');
      }
      const visita = await this.visitaAtualOrFail(
        manager,
        chamado,
        VISITA_STATUS_ATIVOS,
      );
      const motivo = await this.config.motivoOrFail(
        dto.motivoId,
        'cancelamento',
      );
      await this.encerrarVisitaSemExecucao(manager, chamado, visita, user, {
        tipo: 'visita_cancelada',
        nota: dto.motivo,
        motivoId: motivo?.id ?? null,
      });
      return this.findOneTx(manager, id, user);
    });
  }

  // ============================================================ transições do técnico

  /**
   * Ações do técnico (aceitar, a caminho, chegada, pausar…): o próprio técnico
   * dono ou um gerente agindo em nome dele. Trava chamado → visita, valida o
   * status da visita, aplica a mutação, projeta no chamado e registra o evento.
   */
  private async transicaoCampo(
    id: number,
    user: AuthUser,
    permitidos: VisitaStatus[],
    mutate: (
      visita: ChamadoVisita,
      chamado: Chamado,
      manager: EntityManager,
      cfg: AppConfig,
    ) => Promise<{
      tipo: string;
      statusNovo: string;
      nota?: string | null;
      metadata?: Record<string, unknown>;
      afterCommit?: () => Promise<void>;
    }>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      const visita = await this.visitaAtualOrFail(manager, chamado, permitidos);
      const cfg = await this.config.get();
      const statusAnterior = chamado.status;
      const ev = await mutate(visita, chamado, manager, cfg);
      await this.salvarVisitaEChamado(manager, chamado, visita);
      await this.logEvent(manager, id, user, {
        tipo: ev.tipo,
        statusAnterior,
        statusNovo: ev.statusNovo,
        nota: ev.nota ?? null,
        metadata: {
          visitaId: visita.id,
          visitaNumero: visita.numero,
          ...(ev.metadata ?? {}),
        },
      });
      if (ev.afterCommit) this.notifyAfter(ev.afterCommit);
      return this.findOneTx(manager, id, user);
    });
  }

  /** Técnico aceita a solicitação: 'solicitado' -> 'atribuido'. */
  async aceitar(id: number, user: AuthUser) {
    return this.transicaoCampo(id, user, ['solicitado'], (visita) => {
      visita.status = 'atribuido';
      visita.aceitoEm = new Date();
      visita.solicitacaoExpiraEm = null;
      return Promise.resolve({
        tipo: 'solicitacao_aceita',
        statusNovo: 'atribuido',
      });
    });
  }

  /** Técnico recusa a solicitação: visita cancelada, chamado volta a 'aberto'. */
  async recusar(id: number, dto: MotivoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      const visita = await this.visitaAtualOrFail(manager, chamado, [
        'solicitado',
      ]);
      const motivo = await this.config.motivoOrFail(dto.motivoId, 'recusa');
      await this.encerrarVisitaSemExecucao(manager, chamado, visita, user, {
        tipo: 'solicitacao_recusada',
        nota: dto.motivo,
        motivoId: motivo?.id ?? null,
      });
      return this.findOneTx(manager, id, user);
    });
  }

  /** Só a partir de 'atribuido' (= já aceito pelo técnico). */
  async marcarACaminho(id: number, dto: TransicaoCampoDto, user: AuthUser) {
    return this.transicaoCampo(
      id,
      user,
      ['atribuido'],
      async (visita, chamado, manager, cfg) => {
        const geo = this.exigirGeo(cfg, dto.geo);
        visita.status = 'a_caminho';
        visita.aCaminhoEm = new Date();
        visita.aCaminhoLat = geo.lat;
        visita.aCaminhoLng = geo.lng;
        const cliente = await this.clienteTarget(manager, chamado.clientId);
        const info = { ...this.infoDe(chamado), status: 'a_caminho' };
        const tecnicoNome = visita.snapTecnicoNome;
        return {
          tipo: 'a_caminho',
          statusNovo: 'a_caminho',
          metadata: { geo: dto.geo ?? null },
          afterCommit: cliente
            ? () =>
                this.notifier.notifyClienteACaminho(info, cliente, tecnicoNome)
            : undefined,
        };
      },
    );
  }

  /** Check-in: 'atribuido' | 'a_caminho' -> 'em_atendimento'. */
  async confirmarChegada(id: number, dto: TransicaoCampoDto, user: AuthUser) {
    return this.transicaoCampo(
      id,
      user,
      ['atribuido', 'a_caminho'],
      (visita, chamado, _manager, cfg) => {
        const geo = this.exigirGeo(cfg, dto.geo);
        this.exigirCodigo(chamado.codigoCheckin, dto.codigo);
        visita.status = 'em_atendimento';
        visita.chegadaEm = new Date();
        visita.chegadaLat = geo.lat;
        visita.chegadaLng = geo.lng;
        visita.chegadaPrecisaoM = geo.precisaoM;
        visita.chegadaDistanciaM =
          hasCoords(geo.lat, geo.lng) &&
          hasCoords(chamado.latitude, chamado.longitude)
            ? distanceMeters(
                { lat: geo.lat, lng: geo.lng as number },
                { lat: chamado.latitude, lng: chamado.longitude as number },
              )
            : null;
        // Marco da 1ª visita (SLA).
        let slaViolado = false;
        if (!chamado.primeiraVisitaEm) {
          chamado.primeiraVisitaEm = visita.chegadaEm;
          if (
            chamado.prazoPrimeiraVisita &&
            visita.chegadaEm.getTime() > chamado.prazoPrimeiraVisita.getTime()
          ) {
            chamado.slaPrimeiraVisitaViolado = true;
            slaViolado = true;
          }
        }
        return Promise.resolve({
          tipo: 'chegada',
          statusNovo: 'em_atendimento',
          metadata: {
            geo: dto.geo ?? null,
            distanciaM: visita.chegadaDistanciaM,
            slaPrimeiraVisitaViolado: slaViolado,
          },
        });
      },
    );
  }

  /** Pausa o atendimento: 'em_atendimento' -> 'pausado'. */
  async pausar(id: number, dto: PausarDto, user: AuthUser) {
    return this.transicaoCampo(
      id,
      user,
      ['em_atendimento'],
      async (visita, _chamado, manager) => {
        const motivo = await this.config.motivoOrFail(dto.motivoId, 'pausa');
        await manager.getRepository(ChamadoVisitaPausa).insert({
          visitaId: visita.id,
          inicioEm: new Date(),
          motivo: dto.motivo ?? motivo?.nome ?? null,
          motivoId: motivo?.id ?? null,
          createdByUserId: user.userId,
        });
        visita.status = 'pausado';
        return {
          tipo: 'pausado',
          statusNovo: 'pausado',
          nota: dto.motivo ?? null,
        };
      },
    );
  }

  /** Retoma o atendimento: 'pausado' -> 'em_atendimento'. */
  async retomar(id: number, user: AuthUser) {
    return this.transicaoCampo(
      id,
      user,
      ['pausado'],
      async (visita, _chamado, manager) => {
        await manager
          .getRepository(ChamadoVisitaPausa)
          .createQueryBuilder()
          .update()
          .set({ fimEm: new Date() })
          .where('"visitaId" = :vid AND "fimEm" IS NULL', { vid: visita.id })
          .execute();
        visita.status = 'em_atendimento';
        return { tipo: 'retomado', statusNovo: 'em_atendimento' };
      },
    );
  }

  /** Horas líquidas (check-in → agora, menos pausas), em decimal com 2 casas. */
  private async horasSugeridas(manager: EntityManager, visita: ChamadoVisita) {
    if (!visita.chegadaEm) return null;
    const pausas = await manager
      .getRepository(ChamadoVisitaPausa)
      .find({ where: { visitaId: visita.id } });
    const agora = Date.now();
    const pausadoMs = pausas.reduce(
      (acc, p) => acc + ((p.fimEm?.getTime() ?? agora) - p.inicioEm.getTime()),
      0,
    );
    const liquidoMs = Math.max(
      0,
      agora - visita.chegadaEm.getTime() - pausadoMs,
    );
    return (liquidoMs / 3_600_000).toFixed(2);
  }

  async finalizar(id: number, dto: FinalizarDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      const visita = await this.visitaAtualOrFail(manager, chamado, [
        'em_atendimento',
      ]);
      const cfg = await this.config.get();
      const geo = this.exigirGeo(cfg, dto.geo);
      this.exigirCodigo(chamado.codigoCheckout, dto.codigo);

      const semRat =
        (await manager.getRepository(ChamadoRat).count({
          where: { chamadoId: id },
        })) === 0;
      if (cfg.ratObrigatoria && semRat) {
        throw new ConflictException(
          'Anexe a RAT antes de finalizar (obrigatória pela configuração)',
        );
      }
      if (cfg.assinaturaObrigatoria && !dto.assinatura) {
        throw new BadRequestException(
          'Assinatura do cliente obrigatória para finalizar',
        );
      }
      if (dto.assinatura) {
        this.assertPathDoChamado(id, dto.assinatura.storagePath);
        visita.assinaturaPath = dto.assinatura.storagePath;
        visita.assinadoPor = dto.assinatura.assinadoPor;
        visita.assinadoDoc = dto.assinatura.assinadoDoc ?? null;
        visita.assinadoEm = new Date();
      }
      if (dto.avaliacao && cfg.avaliacaoHabilitada) {
        visita.avaliacaoNota = dto.avaliacao.nota;
        visita.avaliacaoComentario = dto.avaliacao.comentario ?? null;
      }

      const horasSugeridas = await this.horasSugeridas(manager, visita);
      const horas = dto.horasTrabalhadas.toFixed(2);
      const km = dto.kmDeslocamento.toFixed(2);
      visita.horasTrabalhadas = horas;
      visita.kmDeslocamento = km;
      visita.observacao = dto.observacao ?? visita.observacao;
      visita.status = 'finalizado';
      visita.finalizadoEm = new Date();
      visita.finalizadoLat = geo.lat;
      visita.finalizadoLng = geo.lng;
      const slaConclusaoViolado =
        !!chamado.prazoConclusao &&
        visita.finalizadoEm.getTime() > chamado.prazoConclusao.getTime();
      if (slaConclusaoViolado) chamado.slaConclusaoViolado = true;
      await this.salvarVisitaEChamado(manager, chamado, visita);

      // Regenera linhas auto de execução DESTA visita (mão de obra + deslocamento).
      await manager.getRepository(ChamadoLineItem).delete({
        chamadoId: id,
        origem: 'auto_snapshot',
        visitaId: visita.id,
        tipo: 'servico',
        descricao: `Visita ${visita.numero} — Mão de obra`,
      });
      await manager
        .getRepository(ChamadoLineItem)
        .createQueryBuilder()
        .delete()
        .where(
          `"chamadoId" = :id AND "origem" = 'auto_snapshot' AND "visitaId" = :vid
           AND ("tipo" = 'deslocamento' OR "descricao" LIKE :mo)`,
          { id, vid: visita.id, mo: `Visita ${visita.numero} — Mão de obra%` },
        )
        .execute();

      const valorHora = visita.snapValorHora;
      if (valorHora && Number(valorHora) > 0 && dto.horasTrabalhadas > 0) {
        await manager.getRepository(ChamadoLineItem).insert({
          chamadoId: id,
          visitaId: visita.id,
          natureza: 'custo',
          tipo: 'servico',
          descricao: `Visita ${visita.numero} — Mão de obra (${horas}h)`,
          quantidade: horas,
          valorUnitario: valorHora,
          valorTotal: multiplyMoney(horas, valorHora),
          origem: 'auto_snapshot',
          createdByUserId: user.userId,
        });
      }
      const custoKm = visita.snapCustoKmCidade ?? visita.snapCustoPorKm;
      if (custoKm && Number(custoKm) > 0 && dto.kmDeslocamento > 0) {
        await manager.getRepository(ChamadoLineItem).insert({
          chamadoId: id,
          visitaId: visita.id,
          natureza: 'custo',
          tipo: 'deslocamento',
          descricao: `Visita ${visita.numero} — Deslocamento (${km} km)`,
          quantidade: km,
          valorUnitario: custoKm,
          valorTotal: multiplyMoney(km, custoKm),
          origem: 'auto_snapshot',
          createdByUserId: user.userId,
        });
      }
      await this.recomputeTotals(manager, id);
      await this.recomputeExecucao(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: 'finalizado',
        statusAnterior: 'em_atendimento',
        statusNovo: 'finalizado',
        nota: dto.observacao ?? null,
        metadata: {
          visitaId: visita.id,
          visitaNumero: visita.numero,
          horasTrabalhadas: horas,
          horasSugeridas,
          kmDeslocamento: km,
          semRat,
          assinado: !!dto.assinatura,
          avaliacaoNota: visita.avaliacaoNota,
          geo: dto.geo ?? null,
          slaConclusaoViolado,
        },
      });

      // Avisa admins para conferência e o cliente da conclusão.
      const admins = await this.adminsTargets(manager);
      const info = { ...this.infoDe(chamado), status: 'finalizado' };
      this.notifyAfter(() =>
        this.notifier.notifyChamadoFinalizado(info, admins),
      );
      const cliente = await this.clienteTarget(manager, chamado.clientId);
      if (cliente) {
        this.notifyAfter(() =>
          this.notifier.notifyClienteConcluido(info, cliente),
        );
      }

      const result = await this.findOneTx(manager, id, user);
      return { ...result, avisoSemRat: semRat, horasSugeridas };
    });
  }

  /** Prévia das horas líquidas da visita em curso (para o modal de finalizar). */
  async previaFinalizacao(id: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const chamado = await this.loadOrFail(id);
    return this.dataSource.transaction(async (manager) => {
      const visita = await this.loadVisitaAtual(manager, chamado);
      if (!visita) return { horasSugeridas: null, pausas: [] };
      const pausas = await manager
        .getRepository(ChamadoVisitaPausa)
        .find({ where: { visitaId: visita.id }, order: { inicioEm: 'ASC' } });
      return {
        horasSugeridas: await this.horasSugeridas(manager, visita),
        chegadaEm: visita.chegadaEm,
        pausas,
      };
    });
  }

  // ============================================================ transições administrativas

  async fechar(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, ['finalizado']);

      await this.recomputeTotals(manager, id);
      const refreshed = await this.loadOrFail(id, manager);

      // Competência = mês da FINALIZAÇÃO (America/Sao_Paulo).
      const base = refreshed.finalizadoEm ?? new Date();
      refreshed.status = 'fechado';
      refreshed.fechadoEm = new Date();
      refreshed.valoresCongeladosEm = new Date();
      refreshed.paymentStatus = 'pendente';
      refreshed.paymentPeriodo = this.competenciaDe(base);
      // Recebimento do cliente começa pendente ao fechar.
      refreshed.clientePaymentStatus = 'pendente';
      refreshed.clientePagoEm = null;
      await manager.getRepository(Chamado).save(refreshed);

      await this.logEvent(manager, id, user, {
        tipo: 'fechado',
        statusAnterior: 'finalizado',
        statusNovo: 'fechado',
        metadata: {
          custoTecnicoTotal: refreshed.custoTecnicoTotal,
          valorClienteTotal: refreshed.valorClienteTotal,
          aliquotaImposto: refreshed.aliquotaImposto,
          impostoTotal: refreshed.impostoTotal,
          paymentPeriodo: refreshed.paymentPeriodo,
        },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  async reabrir(id: number, dto: MotivoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, ['finalizado', 'fechado', 'cancelado']);

      // Reabrir chamado pago é bloqueado (payout já efetivado).
      if (chamado.paymentStatus === 'pago') {
        throw new ConflictException(
          'Chamado já pago — estorne o pagamento antes de reabrir',
        );
      }
      // Reabrir um chamado APROVADO reverte uma aprovação financeira: exige
      // permissão financeira (separação ops × financeiro).
      if (
        chamado.paymentStatus === 'aprovado' &&
        !user.permissions.includes(PERM_FIN_GERENCIAR)
      ) {
        throw new ForbiddenException(
          'Reabrir um chamado aprovado exige permissão financeira',
        );
      }

      const statusAnterior = chamado.status;
      const visita = await this.loadVisitaAtual(manager, chamado);
      const motivo = await this.config.motivoOrFail(dto.motivoId, 'reabertura');

      if (chamado.status === 'fechado') {
        // Descongela totais e limpa o ciclo de pagamento por completo.
        chamado.fechadoEm = null;
        chamado.valoresCongeladosEm = null;
        chamado.paymentStatus = 'nao_aplicavel';
        chamado.paymentPeriodo = null;
        chamado.aprovadoEm = null;
        chamado.pagoEm = null;
        // Recebimento do cliente também volta ao estado inicial.
        chamado.clientePaymentStatus = 'pendente';
        chamado.clientePagoEm = null;
      }

      let destino: ChamadoStatus;
      if (chamado.status === 'cancelado') {
        // Cancelado volta a aberto (a visita cancelada fica no histórico).
        destino = 'aberto';
        chamado.canceladoEm = null;
        chamado.motivoCancelamento = null;
        chamado.motivoCancelamentoId = null;
        chamado.reabertoEm = new Date();
        chamado.motivoReabertura = dto.motivo;
        await this.salvarVisitaEChamado(manager, chamado, visita);
      } else {
        // finalizado/fechado: a visita atual volta para execução.
        if (!visita || visita.status !== 'finalizado') {
          throw new ConflictException('Visita atual não está finalizada');
        }
        destino = 'em_atendimento';
        visita.status = 'em_atendimento';
        visita.finalizadoEm = null;
        visita.finalizadoLat = visita.finalizadoLng = null;
        chamado.reabertoEm = new Date();
        chamado.motivoReabertura = dto.motivo;
        await this.salvarVisitaEChamado(manager, chamado, visita);
      }
      // Descongelado: o imposto volta a seguir a alíquota vigente.
      await this.recomputeTotals(manager, id);
      await this.recomputeExecucao(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: 'reaberto',
        statusAnterior,
        statusNovo: destino,
        nota: dto.motivo,
        metadata: {
          visitaId: visita?.id ?? null,
          motivoId: motivo?.id ?? null,
        },
      });

      if (destino === 'em_atendimento' && visita?.snapTecnicoEmail) {
        this.notifyAfter(() =>
          this.notifier.notifyChamadoReaberto(
            { ...this.infoDe(chamado), status: destino },
            {
              email: visita.snapTecnicoEmail as string,
              name: visita.snapTecnicoNome ?? '',
              userId: visita.tecnicoUserId ?? undefined,
            },
            dto.motivo,
          ),
        );
      }
      return this.findOneTx(manager, id, user);
    });
  }

  /** Cancela o CHAMADO (e a visita em andamento, se houver). Não cancela fechado. */
  async cancelar(id: number, dto: MotivoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, [
        'aberto',
        'solicitado',
        'atribuido',
        'a_caminho',
        'em_atendimento',
        'pausado',
        'finalizado',
      ]);
      const statusAnterior = chamado.status;
      const motivo = await this.config.motivoOrFail(
        dto.motivoId,
        'cancelamento',
      );
      const visita = await this.loadVisitaAtual(manager, chamado);
      if (visita && VISITA_STATUS_ATIVOS.includes(visita.status)) {
        visita.status = 'cancelado';
        visita.canceladoEm = new Date();
        visita.motivoCancelamento = dto.motivo;
        visita.motivoId = motivo?.id ?? null;
        await manager.getRepository(ChamadoVisita).save(visita);
        await manager
          .getRepository(ChamadoVisitaPausa)
          .createQueryBuilder()
          .update()
          .set({ fimEm: new Date() })
          .where('"visitaId" = :vid AND "fimEm" IS NULL', { vid: visita.id })
          .execute();
      }
      // Técnico espelhado é mantido (continua vendo o chamado cancelado).
      chamado.status = 'cancelado';
      chamado.canceladoEm = new Date();
      chamado.motivoCancelamento = dto.motivo;
      chamado.motivoCancelamentoId = motivo?.id ?? null;
      chamado.paymentStatus = 'nao_aplicavel';
      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, {
        tipo: 'cancelado',
        statusAnterior,
        statusNovo: 'cancelado',
        nota: dto.motivo,
        metadata: {
          visitaId: visita?.id ?? null,
          motivoId: motivo?.id ?? null,
        },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  /** Valida a transição do CHAMADO (estados próprios: fechado/cancelado/aberto). */
  private assertTransicao(chamado: Chamado, permitidos: ChamadoStatus[]) {
    if (!permitidos.includes(chamado.status)) {
      throw new ConflictException(
        `Ação inválida para o status atual (${chamado.status})`,
      );
    }
  }

  // ============================================================ arquivamento

  /** Arquiva um chamado encerrado (fechado/cancelado): sai da lista padrão. */
  async arquivar(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, ['fechado', 'cancelado']);
      if (chamado.arquivadoEm) return this.findOneTx(manager, id, user);
      chamado.arquivadoEm = new Date();
      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, { tipo: 'arquivado' });
      return this.findOneTx(manager, id, user);
    });
  }

  async desarquivar(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      if (!chamado.arquivadoEm) return this.findOneTx(manager, id, user);
      chamado.arquivadoEm = null;
      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, { tipo: 'desarquivado' });
      return this.findOneTx(manager, id, user);
    });
  }

  // ============================================================ comentários

  async listComentarios(id: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const rows = await this.dataSource.getRepository(ChamadoComentario).find({
      where: { chamadoId: id },
      order: { createdAt: 'ASC' },
    });
    return rows
      .filter((c) => !c.deletedAt)
      .map((c) => ({
        id: c.id,
        autorUserId: c.autorUserId,
        autorNome: c.autorNome,
        texto: c.texto,
        createdAt: c.createdAt,
      }));
  }

  /**
   * Novo comentário: técnico dono ou gestor. Avisa a outra parte (gestores
   * quando o autor é o técnico; técnico da visita atual quando o autor é gestor).
   */
  async addComentario(id: number, dto: ComentarioDto, user: AuthUser) {
    await this.assertAcessible(id, user);
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      const autor = await manager.getRepository(User).findOne({
        where: { id: user.userId },
        select: { id: true, name: true },
      });
      const autorNome = autor?.name ?? user.email;
      const texto = dto.texto.trim();
      const comentario = await manager.getRepository(ChamadoComentario).save(
        manager.getRepository(ChamadoComentario).create({
          chamadoId: id,
          autorUserId: user.userId,
          autorNome,
          texto,
        }),
      );
      await this.logEvent(manager, id, user, {
        tipo: 'comentario',
        nota: texto.slice(0, 200),
        metadata: { comentarioId: comentario.id },
      });

      const admins = await this.adminsTargets(manager);
      const targets =
        chamado.tecnicoUserId === user.userId
          ? admins
          : chamado.tecnicoUserId && chamado.snapTecnicoEmail
            ? [
                {
                  email: chamado.snapTecnicoEmail,
                  name: chamado.snapTecnicoNome ?? '',
                  userId: chamado.tecnicoUserId,
                },
              ]
            : [];
      const info = this.infoDe(chamado);
      this.notifyAfter(() =>
        this.notifier.notifyComentario(
          info,
          targets.filter((t) => t.userId !== user.userId),
          autorNome,
          texto,
        ),
      );
      return {
        id: comentario.id,
        autorUserId: comentario.autorUserId,
        autorNome: comentario.autorNome,
        texto: comentario.texto,
        createdAt: comentario.createdAt,
      };
    });
  }

  /** Remove (soft) um comentário: o autor ou um gestor. */
  async removeComentario(id: number, comentarioId: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const repo = this.dataSource.getRepository(ChamadoComentario);
    const c = await repo.findOneBy({ id: comentarioId, chamadoId: id });
    if (!c || c.deletedAt) {
      throw new NotFoundException('Comentário não encontrado');
    }
    if (c.autorUserId !== user.userId && !this.isGerente(user)) {
      throw new ForbiddenException('Só o autor ou um gestor pode remover');
    }
    await repo.update(comentarioId, { deletedAt: new Date() });
    return { success: true };
  }

  // ============================================================ rotinas automáticas

  /**
   * Solicitações vencidas (técnico não aceitou no prazo): a visita é encerrada
   * sem execução e o chamado volta a `aberto`; gestores são avisados.
   */
  async expirarSolicitacoes(): Promise<number> {
    const vencidas = await this.visitaRepo
      .createQueryBuilder('v')
      .select(['v.id', 'v.chamadoId'])
      .where("v.status = 'solicitado'")
      .andWhere('v.solicitacaoExpiraEm IS NOT NULL')
      .andWhere('v.solicitacaoExpiraEm < now()')
      .getMany();
    let total = 0;
    for (const { chamadoId } of vencidas) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const chamado = await this.loadOrFail(chamadoId, manager);
          const visita = await this.loadVisitaAtual(manager, chamado);
          if (
            !visita ||
            visita.status !== 'solicitado' ||
            !visita.solicitacaoExpiraEm ||
            visita.solicitacaoExpiraEm.getTime() > Date.now()
          ) {
            return;
          }
          const tecnicoNome = visita.snapTecnicoNome;
          await this.encerrarVisitaSemExecucao(
            manager,
            chamado,
            visita,
            SYSTEM_USER,
            {
              tipo: 'solicitacao_expirada',
              nota: 'Solicitação expirada sem aceite do técnico',
            },
          );
          const admins = await this.adminsTargets(manager);
          const info = { ...this.infoDe(chamado), status: 'aberto' };
          this.notifyAfter(() =>
            this.notifier.notifySolicitacaoExpirada(info, admins, tecnicoNome),
          );
          total++;
        });
      } catch (e) {
        this.logger.warn(
          `Falha ao expirar solicitação do chamado ${chamadoId}: ${(e as Error).message}`,
        );
      }
    }
    return total;
  }

  /**
   * SLA: chamados em aberto com prazo (1ª visita ou conclusão) vencido e ainda
   * sem alerta → evento `sla_violado` + aviso aos gestores (uma vez).
   */
  async monitorarSla(): Promise<number> {
    const estourados = await this.chamadoRepo
      .createQueryBuilder('c')
      .where("c.status NOT IN ('fechado','cancelado')")
      .andWhere('c.slaAlertaEnviadoEm IS NULL')
      .andWhere(
        `((c.prazoPrimeiraVisita < now() AND c.primeiraVisitaEm IS NULL)
          OR (c.prazoConclusao < now() AND c.finalizadoEm IS NULL))`,
      )
      .getMany();
    let total = 0;
    for (const { id } of estourados) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const chamado = await this.loadOrFail(id, manager);
          if (chamado.slaAlertaEnviadoEm) return;
          const agora = Date.now();
          const detalhes: string[] = [];
          if (
            chamado.prazoPrimeiraVisita &&
            !chamado.primeiraVisitaEm &&
            chamado.prazoPrimeiraVisita.getTime() < agora
          ) {
            chamado.slaPrimeiraVisitaViolado = true;
            detalhes.push('prazo da 1ª visita vencido sem check-in');
          }
          if (
            chamado.prazoConclusao &&
            !chamado.finalizadoEm &&
            chamado.prazoConclusao.getTime() < agora
          ) {
            chamado.slaConclusaoViolado = true;
            detalhes.push('prazo de conclusão vencido');
          }
          if (!detalhes.length) return;
          chamado.slaAlertaEnviadoEm = new Date();
          await manager.getRepository(Chamado).save(chamado);
          const detalhe = detalhes.join('; ');
          await this.logEvent(manager, id, SYSTEM_USER, {
            tipo: 'sla_violado',
            nota: detalhe,
            metadata: {
              prazoPrimeiraVisita: chamado.prazoPrimeiraVisita,
              prazoConclusao: chamado.prazoConclusao,
            },
          });
          const admins = await this.adminsTargets(manager);
          const info = this.infoDe(chamado);
          this.notifyAfter(() =>
            this.notifier.notifySlaEstourado(info, admins, detalhe),
          );
          total++;
        });
      } catch (e) {
        this.logger.warn(
          `Falha ao monitorar SLA do chamado ${id}: ${(e as Error).message}`,
        );
      }
    }
    return total;
  }

  // ============================================================ financeiro

  async addLineItem(id: number, dto: CreateLineItemDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertNaoCongelado(chamado);
      const quantidade = (dto.quantidade ?? 1).toString();
      const valorUnitario = parseBrMoney(dto.valorUnitario) ?? '0';
      const valorTotal = multiplyMoney(quantidade, valorUnitario);
      const item = await manager.getRepository(ChamadoLineItem).save(
        manager.getRepository(ChamadoLineItem).create({
          chamadoId: id,
          natureza: dto.natureza,
          tipo: dto.tipo,
          descricao: dto.descricao ?? null,
          quantidade,
          valorUnitario,
          valorTotal,
          origem: 'manual',
          createdByUserId: user.userId,
        }),
      );
      await this.recomputeTotals(manager, id);
      await this.logEvent(manager, id, user, {
        tipo: 'line_item_alterado',
        nota: 'linha adicionada',
        metadata: { acao: 'add', item },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  async updateLineItem(
    id: number,
    itemId: number,
    dto: UpdateLineItemDto,
    user: AuthUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertNaoCongelado(chamado);
      const repo = manager.getRepository(ChamadoLineItem);
      const item = await repo.findOne({ where: { id: itemId, chamadoId: id } });
      if (!item) throw new NotFoundException('Linha não encontrada');
      const antes = { ...item };
      if (dto.descricao !== undefined) item.descricao = dto.descricao;
      if (dto.quantidade !== undefined)
        item.quantidade = dto.quantidade.toString();
      if (dto.valorUnitario !== undefined)
        item.valorUnitario = parseBrMoney(dto.valorUnitario) ?? '0';
      item.valorTotal = multiplyMoney(item.quantidade, item.valorUnitario);
      await repo.save(item);
      await this.recomputeTotals(manager, id);
      await this.logEvent(manager, id, user, {
        tipo: 'line_item_alterado',
        nota: 'linha editada',
        metadata: { acao: 'update', antes, depois: item },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  async removeLineItem(id: number, itemId: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertNaoCongelado(chamado);
      const repo = manager.getRepository(ChamadoLineItem);
      const item = await repo.findOne({ where: { id: itemId, chamadoId: id } });
      if (!item) throw new NotFoundException('Linha não encontrada');
      await repo.remove(item);
      await this.recomputeTotals(manager, id);
      await this.logEvent(manager, id, user, {
        tipo: 'line_item_alterado',
        nota: 'linha removida',
        metadata: { acao: 'remove', itemId },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  /** Ajusta a nota fiscal / alíquota do chamado e recalcula o imposto. */
  async updateImposto(id: number, dto: UpdateImpostoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertNaoCongelado(chamado);
      const antes = {
        emiteNota: chamado.emiteNota,
        aliquotaImpostoManual: chamado.aliquotaImpostoManual,
        aliquotaImposto: chamado.aliquotaImposto,
        impostoTotal: chamado.impostoTotal,
      };

      if (dto.emiteNota !== undefined) chamado.emiteNota = dto.emiteNota;
      // null volta para a alíquota vigente; ausente mantém.
      if (dto.aliquotaImpostoManual !== undefined) {
        chamado.aliquotaImpostoManual =
          dto.aliquotaImpostoManual === null
            ? null
            : dto.aliquotaImpostoManual.toFixed(2);
      }
      await manager.getRepository(Chamado).save(chamado);
      await this.recomputeTotals(manager, id);

      const depois = await this.loadOrFail(id, manager);
      await this.logEvent(manager, id, user, {
        tipo: 'financeiro_alterado',
        nota: 'imposto alterado',
        metadata: {
          antes,
          depois: {
            emiteNota: depois.emiteNota,
            aliquotaImpostoManual: depois.aliquotaImpostoManual,
            aliquotaImposto: depois.aliquotaImposto,
            impostoTotal: depois.impostoTotal,
          },
        },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  async updatePagamento(id: number, dto: UpdatePagamentoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      if (chamado.status !== 'fechado') {
        throw new ConflictException(
          'Pagamento só pode ser gerido em chamados fechados',
        );
      }
      const antes = {
        paymentStatus: chamado.paymentStatus,
        paymentPeriodo: chamado.paymentPeriodo,
        clientePaymentStatus: chamado.clientePaymentStatus,
      };

      if (dto.paymentPeriodo !== undefined) {
        if (chamado.paymentStatus === 'pago') {
          throw new ConflictException(
            'Não é possível mudar a competência de um chamado já pago',
          );
        }
        if (!/^\d{4}-\d{2}$/.test(dto.paymentPeriodo)) {
          throw new BadRequestException('Competência inválida (use YYYY-MM)');
        }
        chamado.paymentPeriodo = dto.paymentPeriodo;
      }
      if (dto.financeiroObs !== undefined)
        chamado.financeiroObs = dto.financeiroObs;

      if (dto.paymentStatus) {
        const de = chamado.paymentStatus;
        this.assertPagamentoTransicao(de, dto.paymentStatus);
        chamado.paymentStatus = dto.paymentStatus;
        if (dto.paymentStatus === 'aprovado') {
          chamado.aprovadoEm = new Date();
          // Estorno de 'pago' -> 'aprovado': limpa a data de pagamento.
          if (de === 'pago') chamado.pagoEm = null;
        }
        if (dto.paymentStatus === 'pago') chamado.pagoEm = new Date();
      }

      // Recebimento do cliente (independente do pagamento ao técnico).
      if (dto.clientePaymentStatus) {
        chamado.clientePaymentStatus = dto.clientePaymentStatus;
        chamado.clientePagoEm =
          dto.clientePaymentStatus === 'pago' ? new Date() : null;
      }

      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, {
        tipo: 'pagamento_alterado',
        metadata: {
          antes,
          depois: {
            paymentStatus: chamado.paymentStatus,
            paymentPeriodo: chamado.paymentPeriodo,
            clientePaymentStatus: chamado.clientePaymentStatus,
          },
        },
      });
      return this.findOneTx(manager, id, user);
    });
  }

  private assertPagamentoTransicao(from: string, to: string) {
    const allowed: Record<string, string[]> = {
      pendente: ['aprovado'],
      aprovado: ['pago', 'pendente'],
      pago: ['aprovado'], // estorno
    };
    if (!allowed[from]?.includes(to)) {
      throw new ConflictException(
        `Transição de pagamento inválida: ${from} -> ${to}`,
      );
    }
  }

  // ============================================================ RAT / anexos

  /** Quem pode anexar RAT: dono do chamado ou gerente, chamado não encerrado. */
  private async assertPodeAnexarRat(id: number, user: AuthUser) {
    const chamado = await this.loadOrFail(id);
    if (chamado.tecnicoUserId !== user.userId && !this.isGerente(user)) {
      throw new ForbiddenException('Sem permissão para anexar RAT');
    }
    if (
      ['fechado', 'cancelado'].includes(chamado.status) &&
      !this.isGerente(user)
    ) {
      throw new ConflictException('Chamado encerrado');
    }
    return chamado;
  }

  /** Valida que um path é confinado a este chamado (sem traversal/URL absoluta). */
  private assertPathDoChamado(id: number, path: string) {
    const prefix = `chamados/${id}/`;
    if (/^https?:\/\//i.test(path) || path.includes('..')) {
      throw new BadRequestException('storagePath inválido');
    }
    if (!path.startsWith(prefix)) {
      throw new BadRequestException(`storagePath deve começar com "${prefix}"`);
    }
  }

  /** Timestamp do banco para compor paths únicos no Storage. */
  private async storageTs(): Promise<string> {
    const rows: { ts: string }[] = await this.dataSource.query(
      `SELECT to_char(now(), 'YYYYMMDD"T"HH24MISSMS') AS ts`,
    );
    return rows[0].ts;
  }

  /** Gera uma signed upload URL para o cliente subir o arquivo da RAT. */
  async createRatUploadUrl(id: number, fileName: string, user: AuthUser) {
    await this.assertPodeAnexarRat(id, user);
    // Sanitiza o nome; o path é sempre montado pelo servidor (nunca do cliente).
    const safeName = (fileName || 'rat').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `chamados/${id}/${await this.storageTs()}-${safeName}`;
    const signed = await this.storage.createSignedUploadUrl(path);
    return { ...signed, fileName: safeName };
  }

  /** Signed upload URL para a imagem da assinatura do cliente (PNG). */
  async createAssinaturaUploadUrl(id: number, user: AuthUser) {
    await this.assertPodeAnexarRat(id, user);
    const path = `chamados/${id}/assinaturas/${await this.storageTs()}.png`;
    return this.storage.createSignedUploadUrl(path);
  }

  /** Signed download URL da assinatura de uma visita (escopo validado). */
  async getAssinaturaDownloadUrl(id: number, visitaId: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const visita = await this.visitaRepo.findOneBy({
      id: visitaId,
      chamadoId: id,
    });
    if (!visita?.assinaturaPath) {
      throw new NotFoundException('Assinatura não encontrada');
    }
    return this.storage.createSignedDownloadUrl(visita.assinaturaPath);
  }

  /** Gera uma signed download URL após validar o escopo de acesso. */
  async getRatDownloadUrl(id: number, ratId: number, user: AuthUser) {
    await this.assertAcessible(id, user);
    const rat = await this.ratRepo.findOne({
      where: { id: ratId, chamadoId: id },
    });
    if (!rat) throw new NotFoundException('RAT não encontrada');
    return this.storage.createSignedDownloadUrl(rat.storagePath);
  }

  async addRat(id: number, dto: CreateRatDto, user: AuthUser) {
    await this.assertPodeAnexarRat(id, user);
    this.assertPathDoChamado(id, dto.storagePath);
    return this.dataSource.transaction(async (manager) => {
      const rat = await manager.getRepository(ChamadoRat).save(
        manager.getRepository(ChamadoRat).create({
          chamadoId: id,
          storagePath: dto.storagePath,
          fileName: dto.fileName,
          mimeType: dto.mimeType ?? null,
          sizeBytes: dto.sizeBytes ?? null,
          observacoes: dto.observacoes ?? null,
          uploadedByUserId: user.userId,
        }),
      );
      await this.logEvent(manager, id, user, {
        tipo: 'rat_anexado',
        metadata: { ratId: rat.id, fileName: rat.fileName },
      });
      return rat;
    });
  }

  /** Remove uma RAT (registro + objeto no Storage). Dono ou gestor. */
  async removeRat(id: number, ratId: number, user: AuthUser) {
    await this.assertPodeAnexarRat(id, user);
    const rat = await this.ratRepo.findOne({
      where: { id: ratId, chamadoId: id },
    });
    if (!rat) throw new NotFoundException('RAT não encontrada');

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ChamadoRat).delete({ id: ratId });
      await this.logEvent(manager, id, user, {
        tipo: 'rat_removido',
        metadata: { ratId, fileName: rat.fileName },
      });
    });

    // Remove o objeto do Storage após o commit. Falha aqui só deixa um
    // objeto órfão (inofensivo) e é logada — não desfaz a remoção do registro.
    try {
      await this.storage.remove(rat.storagePath);
    } catch (e) {
      this.logger.warn(
        `RAT ${ratId} removida do banco, mas o objeto ${rat.storagePath} não foi apagado: ${(e as Error).message}`,
      );
    }
    return { success: true };
  }

  // ============================================================ util

  /**
   * Ações do técnico: o próprio técnico dono (espelhado no chamado) ou um
   * gerente agindo em nome dele. O evento registra o ator real
   * (atorEmail/atorRole), então a ação em nome fica auditável.
   */
  private assertDono(chamado: Chamado, user: AuthUser) {
    if (chamado.tecnicoUserId !== user.userId && !this.isGerente(user)) {
      throw new ForbiddenException('Ação restrita ao técnico do chamado');
    }
  }

  // ============================================================ serialização

  private async findOneTx(manager: EntityManager, id: number, user: AuthUser) {
    const chamado = await manager.getRepository(Chamado).findOne({
      where: { id },
      relations: {
        client: true,
        city: true,
        tecnicoUser: true,
        lineItems: true,
        visitas: { pausas: true },
        servico: true,
      },
      order: { visitas: { numero: 'ASC', pausas: { inicioEm: 'ASC' } } },
    });
    return this.serialize(chamado as Chamado, user, { includeLineItems: true });
  }

  /** SLA estourado = violado (marcado) ou prazo vencido com marco pendente, em chamado aberto. */
  private slaEstourado(c: Chamado, qual: 'primeiraVisita' | 'conclusao') {
    if (['fechado', 'cancelado'].includes(c.status)) {
      return qual === 'primeiraVisita'
        ? c.slaPrimeiraVisitaViolado
        : c.slaConclusaoViolado;
    }
    const prazo =
      qual === 'primeiraVisita' ? c.prazoPrimeiraVisita : c.prazoConclusao;
    const marco =
      qual === 'primeiraVisita' ? c.primeiraVisitaEm : c.finalizadoEm;
    const violado =
      qual === 'primeiraVisita'
        ? c.slaPrimeiraVisitaViolado
        : c.slaConclusaoViolado;
    return violado || (!!prazo && !marco && prazo.getTime() < Date.now());
  }

  /** Visita sem dados sensíveis do cliente (códigos de check-in nunca saem). */
  private serializeVisita(v: ChamadoVisita) {
    return {
      id: v.id,
      chamadoId: v.chamadoId,
      numero: v.numero,
      status: v.status,
      tecnicoUserId: v.tecnicoUserId,
      tecnicoNome: v.snapTecnicoNome,
      agendadoPara: v.agendadoPara,
      duracaoPrevistaMin: v.duracaoPrevistaMin,
      ordemRota: v.ordemRota,
      solicitacaoExpiraEm: v.solicitacaoExpiraEm,
      atribuidoEm: v.atribuidoEm,
      aceitoEm: v.aceitoEm,
      visualizadoEm: v.visualizadoEm,
      aCaminhoEm: v.aCaminhoEm,
      chegadaEm: v.chegadaEm,
      finalizadoEm: v.finalizadoEm,
      canceladoEm: v.canceladoEm,
      motivoCancelamento: v.motivoCancelamento,
      motivoId: v.motivoId,
      horasTrabalhadas: v.horasTrabalhadas,
      kmDeslocamento: v.kmDeslocamento,
      observacao: v.observacao,
      aCaminhoLat: v.aCaminhoLat,
      aCaminhoLng: v.aCaminhoLng,
      chegadaLat: v.chegadaLat,
      chegadaLng: v.chegadaLng,
      chegadaPrecisaoM: v.chegadaPrecisaoM,
      chegadaDistanciaM: v.chegadaDistanciaM,
      finalizadoLat: v.finalizadoLat,
      finalizadoLng: v.finalizadoLng,
      assinado: !!v.assinaturaPath,
      assinadoPor: v.assinadoPor,
      assinadoDoc: v.assinadoDoc,
      assinadoEm: v.assinadoEm,
      avaliacaoNota: v.avaliacaoNota,
      avaliacaoComentario: v.avaliacaoComentario,
      pausas: (v.pausas ?? []).map((p) => ({
        id: p.id,
        inicioEm: p.inicioEm,
        fimEm: p.fimEm,
        motivo: p.motivo,
        motivoId: p.motivoId,
      })),
      createdAt: v.createdAt,
    };
  }

  /**
   * Serializa um chamado ocultando dados de receita/margem de quem não tem
   * financeiro.ver (inclusive técnicos com financeiro.ver_proprio: só custo).
   */
  private serialize(
    chamado: Chamado,
    user: AuthUser,
    opts: { includeLineItems: boolean },
  ) {
    const podeFin = user.permissions.includes(PERM_FIN_VER);
    const gerente = this.isGerente(user);
    const base: Record<string, unknown> = {
      id: chamado.id,
      codigo: chamado.codigo,
      titulo: chamado.titulo,
      descricao: chamado.descricao,
      chamadoInterno: chamado.chamadoInterno,
      chamadoExterno: chamado.chamadoExterno,
      prioridade: chamado.prioridade,
      status: chamado.status,
      agendadoPara: chamado.agendadoPara,
      visitaAtualId: chamado.visitaAtualId,
      servicoId: chamado.servicoId,
      servico: chamado.servico
        ? { id: chamado.servico.id, nome: chamado.servico.nome }
        : null,
      arquivadoEm: chamado.arquivadoEm,
      // SLA: prazos, marcos e situação (estourado = violado ou vencido em aberto).
      prazoPrimeiraVisita: chamado.prazoPrimeiraVisita,
      prazoConclusao: chamado.prazoConclusao,
      primeiraVisitaEm: chamado.primeiraVisitaEm,
      slaPrimeiraVisitaEstourado: this.slaEstourado(chamado, 'primeiraVisita'),
      slaConclusaoEstourado: this.slaEstourado(chamado, 'conclusao'),
      clientId: chamado.clientId,
      client: chamado.client
        ? {
            id: chamado.client.id,
            nome: chamado.client.nome,
            tipo: chamado.client.tipo,
            telefone: chamado.client.telefone,
          }
        : null,
      localId: chamado.localId,
      cityCode: chamado.cityCode,
      city: chamado.city
        ? {
            code: chamado.city.code,
            nome: chamado.city.nome,
            uf: chamado.city.uf,
          }
        : null,
      cep: chamado.cep,
      logradouro: chamado.logradouro,
      numero: chamado.numero,
      complemento: chamado.complemento,
      bairro: chamado.bairro,
      pontoReferencia: chamado.pontoReferencia,
      latitude: chamado.latitude,
      longitude: chamado.longitude,
      contatoLocalNome: chamado.contatoLocalNome,
      contatoLocalTelefone: chamado.contatoLocalTelefone,
      // Técnico só sabe que existe código (o cliente informa no local).
      exigeCodigoCheckin: !!chamado.codigoCheckin,
      exigeCodigoCheckout: !!chamado.codigoCheckout,
      tecnicoUserId: chamado.tecnicoUserId,
      tecnicoNome: chamado.snapTecnicoNome ?? chamado.tecnicoUser?.name ?? null,
      atribuidoEm: chamado.atribuidoEm,
      aCaminhoEm: chamado.aCaminhoEm,
      chegadaEm: chamado.chegadaEm,
      finalizadoEm: chamado.finalizadoEm,
      fechadoEm: chamado.fechadoEm,
      canceladoEm: chamado.canceladoEm,
      reabertoEm: chamado.reabertoEm,
      motivoCancelamento: chamado.motivoCancelamento,
      motivoCancelamentoId: chamado.motivoCancelamentoId,
      motivoReabertura: chamado.motivoReabertura,
      horasTrabalhadas: chamado.horasTrabalhadas,
      kmDeslocamento: chamado.kmDeslocamento,
      custoTecnicoTotal: chamado.custoTecnicoTotal,
      paymentStatus: chamado.paymentStatus,
      paymentPeriodo: chamado.paymentPeriodo,
      aprovadoEm: chamado.aprovadoEm,
      pagoEm: chamado.pagoEm,
      valoresCongeladosEm: chamado.valoresCongeladosEm,
      createdAt: chamado.createdAt,
      updatedAt: chamado.updatedAt,
      version: chamado.version,
    };

    if (gerente) {
      base.codigoCheckin = chamado.codigoCheckin;
      base.codigoCheckout = chamado.codigoCheckout;
    }

    // Receita/margem e recebimento do cliente só para quem tem financeiro.ver.
    if (podeFin) {
      base.valorClienteTotal = chamado.valorClienteTotal;
      base.emiteNota = chamado.emiteNota;
      base.aliquotaImposto = chamado.aliquotaImposto;
      base.aliquotaImpostoManual = chamado.aliquotaImpostoManual;
      base.impostoTotal = chamado.impostoTotal;
      base.margem = this.margemDe(chamado);
      base.clientePaymentStatus = chamado.clientePaymentStatus;
      base.clientePagoEm = chamado.clientePagoEm;
      base.financeiroObs = chamado.financeiroObs;
    }

    if (opts.includeLineItems && chamado.lineItems) {
      const items = podeFin
        ? chamado.lineItems
        : chamado.lineItems.filter((i) => i.natureza === 'custo');
      base.lineItems = items.map((i) => ({
        id: i.id,
        visitaId: i.visitaId,
        natureza: i.natureza,
        tipo: i.tipo,
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        valorTotal: i.valorTotal,
        origem: i.origem,
      }));
    }

    if (chamado.visitas) {
      const visitas = [...chamado.visitas].sort((a, b) => a.numero - b.numero);
      base.visitas = visitas.map((v) => this.serializeVisita(v));
      const atual = visitas.find((v) => v.id === chamado.visitaAtualId);
      base.visitaAtual = atual ? this.serializeVisita(atual) : null;
    }
    return base;
  }

  /**
   * Metadata seguro para quem NÃO tem financeiro.ver. Eventos financeiros
   * carregam receita (inclusive aninhada em objetos de linha) — para esses
   * tipos, não expomos metadata alguma. Os demais eventos têm apenas dados
   * operacionais (snapshots de custo, horas/km), que o técnico pode ver.
   */
  private safeMetadata(e: ChamadoEvent): Record<string, unknown> | null {
    const FINANCEIRO_TIPOS = [
      'line_item_alterado',
      'financeiro_alterado',
      'pagamento_alterado',
      'fechado',
    ];
    if (FINANCEIRO_TIPOS.includes(e.tipo)) return null;
    return e.metadata;
  }

  /** Dispara notificação sem bloquear nem derrubar o fluxo. */
  private notifyAfter(fn: () => Promise<void>) {
    // Fire-and-forget: erros só logam.
    void Promise.resolve()
      .then(fn)
      .catch((e) =>
        this.logger.warn(`Falha ao notificar: ${(e as Error).message}`),
      );
  }
}
