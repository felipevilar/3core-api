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
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Chamado, ChamadoStatus } from './entities/chamado.entity';
import { ChamadoLineItem } from './entities/chamado-line-item.entity';
import { ChamadoEvent } from './entities/chamado-event.entity';
import { ChamadoRat } from './entities/chamado-rat.entity';
import { Client } from '../clients/entities/client.entity';
import { User } from '../auth/entities/user.entity';
import { TechServiceArea } from '../technicians/entities/tech-service-area.entity';
import { CreateChamadoDto } from './dto/create-chamado.dto';
import { UpdateChamadoDto } from './dto/update-chamado.dto';
import { ListChamadosQueryDto } from './dto/list-chamados.query.dto';
import {
  AtribuirDto,
  CreateLineItemDto,
  CreateRatDto,
  FinalizarDto,
  MotivoDto,
  UpdateLineItemDto,
  UpdatePagamentoDto,
} from './dto/chamado-actions.dto';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { NOTIFIER } from '../notifications/notifier';
import type { Notifier } from '../notifications/notifier';
import { multiplyMoney, parseBrMoney, sumMoney } from '../common/br-money';
import { ROLE_SUPER_ADMIN } from '../auth/permissions.catalog';
import { StorageService } from '../storage/storage.service';

const PERM_GERENCIAR = 'atendimentos.gerenciar';
const PERM_FIN_VER = 'financeiro.ver';
const PERM_FIN_GERENCIAR = 'financeiro.gerenciar';

@Injectable()
export class ChamadosService {
  private readonly logger = new Logger(ChamadosService.name);

  constructor(
    @InjectRepository(Chamado)
    private readonly chamadoRepo: Repository<Chamado>,
    @InjectRepository(ChamadoRat)
    private readonly ratRepo: Repository<ChamadoRat>,
    private readonly dataSource: DataSource,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    private readonly storage: StorageService,
  ) {}

  // ============================================================ helpers

  private isGerente(user: AuthUser): boolean {
    return user.permissions.includes(PERM_GERENCIAR);
  }

  /** Restringe queries ao próprio técnico quando ele não é gerente. */
  private applyTecnicoScope(qb: SelectQueryBuilder<Chamado>, user: AuthUser) {
    if (!this.isGerente(user)) {
      qb.andWhere('c.tecnicoUserId = :uid', { uid: user.userId });
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
      atorUserId: user.userId,
      atorRole: user.role,
      atorEmail: user.email,
      nota: data.nota ?? null,
      metadata: data.metadata ?? null,
    });
    await repo.save(event);
  }

  /** Recalcula os totais (custo/receita) a partir das linhas. */
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
    await manager.getRepository(Chamado).update(chamadoId, {
      custoTecnicoTotal: custo,
      valorClienteTotal: receita,
    });
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

  // ============================================================ leitura

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
        '(c.titulo ILIKE :s OR c.codigo ILIKE :s OR client.nome ILIKE :s)',
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
  private applyDateRange(
    qb: SelectQueryBuilder<Chamado>,
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
      .where('c.id = :id', { id });
    this.applyTecnicoScope(qb, user);

    const chamado = await qb.getOne();
    // NotFound (não Forbidden) fora do escopo — não vaza existência.
    if (!chamado) throw new NotFoundException('Chamado não encontrado');
    return this.serialize(chamado, user, { includeLineItems: true });
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

  async create(dto: CreateChamadoDto, user: AuthUser) {
    const client = await this.dataSource
      .getRepository(Client)
      .findOne({ where: { id: dto.clientId }, relations: { city: true } });
    if (!client) throw new BadRequestException('Cliente inválido');

    return this.dataSource.transaction(async (manager) => {
      const seq: { n: string }[] = await manager.query(
        `SELECT nextval('chamados_codigo_seq') AS n`,
      );
      const codigo = `CH-${String(seq[0].n).padStart(6, '0')}`;

      const chamado = manager.getRepository(Chamado).create({
        codigo,
        clientId: client.id,
        cityCode: dto.cityCode ?? client.cityCode ?? null,
        cep: dto.cep ?? client.cep ?? null,
        logradouro: dto.logradouro ?? client.logradouro ?? null,
        numero: dto.numero ?? client.numero ?? null,
        complemento: dto.complemento ?? client.complemento ?? null,
        bairro: dto.bairro ?? client.bairro ?? null,
        pontoReferencia: dto.pontoReferencia ?? null,
        titulo: dto.titulo,
        descricao: dto.descricao ?? null,
        chamadoInterno: dto.chamadoInterno ?? null,
        chamadoExterno: dto.chamadoExterno ?? null,
        prioridade: dto.prioridade ?? 'media',
        status: 'aberto',
        agendadoPara: dto.agendadoPara ? new Date(dto.agendadoPara) : null,
        createdByUserId: user.userId,
      });
      const saved = await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, saved.id, user, {
        tipo: 'criado',
        statusNovo: 'aberto',
      });
      return this.serialize(saved, user, { includeLineItems: true });
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

      const before = { cityCode: chamado.cityCode };
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
        // `undefined` mantém; `null`/'' limpa o agendamento.
        agendadoPara:
          dto.agendadoPara === undefined
            ? chamado.agendadoPara
            : dto.agendadoPara
              ? new Date(dto.agendadoPara)
              : null,
      });

      const cidadeMudou =
        dto.cityCode !== undefined && dto.cityCode !== chamado.cityCode;
      if (dto.cityCode !== undefined) chamado.cityCode = dto.cityCode;

      // Re-congela o custo por km da nova cidade se já havia técnico.
      if (cidadeMudou && chamado.tecnicoUserId && chamado.techProfileId) {
        const area = await manager.getRepository(TechServiceArea).findOne({
          where: {
            techProfileId: chamado.techProfileId,
            cityCode: chamado.cityCode ?? undefined,
          },
        });
        chamado.snapCustoKmCidade = area ? area.custoKm : null;
      }

      await manager.getRepository(Chamado).save(chamado);
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
    if (chamado.status !== 'aberto') {
      throw new ConflictException(
        'Só é possível excluir um chamado ainda aberto (sem histórico)',
      );
    }
    await this.chamadoRepo.remove(chamado);
    return { success: true };
  }

  // ============================================================ transições

  /** Valida a transição e a versão (lock otimista) dentro da transação. */
  private assertTransicao(chamado: Chamado, permitidos: ChamadoStatus[]) {
    if (!permitidos.includes(chamado.status)) {
      throw new ConflictException(
        `Ação inválida para o status atual (${chamado.status})`,
      );
    }
  }

  async atribuir(id: number, dto: AtribuirDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, [
        'aberto',
        'solicitado',
        'atribuido',
        'a_caminho',
        'em_atendimento',
      ]);
      const reatribuicao = chamado.status !== 'aberto';

      const tecnico = await manager.getRepository(User).findOne({
        where: { id: dto.tecnicoUserId },
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

      // Congela tarifas do técnico (snapshot). Dados faltando => null (não falha).
      const snapValorHora = parseBrMoney(profile.pretensaoValorHora);
      const snapCustoPorKm = parseBrMoney(profile.custoPorKm);
      let snapCustoKmCidade: string | null = null;
      if (chamado.cityCode) {
        const area = await manager.getRepository(TechServiceArea).findOne({
          where: { techProfileId: profile.id, cityCode: chamado.cityCode },
        });
        snapCustoKmCidade = area ? area.custoKm : null;
      }

      const statusAnterior = chamado.status;
      chamado.tecnicoUserId = tecnico.id;
      chamado.techProfileId = profile.id;
      chamado.snapTecnicoNome = tecnico.name;
      chamado.snapTecnicoEmail = tecnico.email;
      chamado.snapValorHora = snapValorHora;
      chamado.snapCustoPorKm = snapCustoPorKm;
      chamado.snapCustoKmCidade = snapCustoKmCidade;
      // Vai para "solicitado": aguarda o técnico aceitar antes de virar
      // "atribuido" (e ficar visível para ele na lista de chamados).
      chamado.status = 'solicitado';
      chamado.atribuidoEm = new Date();
      // Reatribuição limpa progresso e regenera linhas auto.
      chamado.aCaminhoEm = null;
      chamado.chegadaEm = null;
      await manager.getRepository(Chamado).save(chamado);

      // Remove linhas auto_snapshot antigas (recomputadas na finalização).
      await manager
        .getRepository(ChamadoLineItem)
        .delete({ chamadoId: id, origem: 'auto_snapshot' });

      // Chamada fixa (custo) opcional na atribuição.
      const chamadaFixa = parseBrMoney(dto.chamadaFixa);
      if (chamadaFixa && Number(chamadaFixa) > 0) {
        await manager.getRepository(ChamadoLineItem).insert({
          chamadoId: id,
          natureza: 'custo',
          tipo: 'servico',
          descricao: 'Serviço fixo',
          quantidade: '1',
          valorUnitario: chamadaFixa,
          valorTotal: chamadaFixa,
          origem: 'auto_snapshot',
          createdByUserId: user.userId,
        });
      }
      await this.recomputeTotals(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: reatribuicao ? 'reatribuido' : 'atribuido',
        statusAnterior,
        statusNovo: 'solicitado',
        metadata: {
          tecnicoUserId: tecnico.id,
          snapValorHora,
          snapCustoPorKm,
          snapCustoKmCidade,
          rawValorHora: profile.pretensaoValorHora,
        },
      });

      // Notifica APÓS o commit (fora da transação) — ver wrapper abaixo.
      this.notifyAfter(() =>
        this.notifier.notifyChamadoAtribuido(
          {
            id: chamado.id,
            codigo: chamado.codigo,
            titulo: chamado.titulo,
            status: chamado.status,
          },
          { email: tecnico.email, name: tecnico.name },
        ),
      );

      return this.findOneTx(manager, id, user);
    });
  }

  /**
   * Remove o técnico do chamado (volta para "aberto"). Descarta o snapshot de
   * tarifas e as linhas auto (chamada fixa / mão de obra / deslocamento), que
   * dependem do técnico; as linhas manuais são preservadas. Só gestor.
   */
  async desatribuir(id: number, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, [
        'solicitado',
        'atribuido',
        'a_caminho',
        'em_atendimento',
      ]);
      if (!chamado.tecnicoUserId) {
        throw new ConflictException('Chamado não possui técnico atribuído');
      }

      const statusAnterior = chamado.status;
      const tecnicoRemovidoId = chamado.tecnicoUserId;
      chamado.tecnicoUserId = null;
      chamado.techProfileId = null;
      chamado.snapTecnicoNome = null;
      chamado.snapTecnicoEmail = null;
      chamado.snapValorHora = null;
      chamado.snapCustoPorKm = null;
      chamado.snapCustoKmCidade = null;
      chamado.status = 'aberto';
      chamado.atribuidoEm = null;
      chamado.aCaminhoEm = null;
      chamado.chegadaEm = null;
      await manager.getRepository(Chamado).save(chamado);

      // Linhas auto (dependem do técnico) são descartadas; manuais permanecem.
      await manager
        .getRepository(ChamadoLineItem)
        .delete({ chamadoId: id, origem: 'auto_snapshot' });
      await this.recomputeTotals(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: 'desatribuido',
        statusAnterior,
        statusNovo: 'aberto',
        metadata: { tecnicoRemovidoId },
      });

      return this.findOneTx(manager, id, user);
    });
  }

  /** Ações do próprio técnico (a caminho / chegada). */
  async marcarACaminho(id: number, user: AuthUser) {
    // Só a partir de 'atribuido' (= já aceito pelo técnico).
    return this.transicaoDono(id, user, ['atribuido'], (chamado) => {
      chamado.status = 'a_caminho';
      chamado.aCaminhoEm = new Date();
      return { tipo: 'a_caminho', statusNovo: 'a_caminho' };
    });
  }

  async confirmarChegada(id: number, user: AuthUser) {
    return this.transicaoDono(
      id,
      user,
      ['atribuido', 'a_caminho'],
      (chamado) => {
        chamado.status = 'em_atendimento';
        chamado.chegadaEm = new Date();
        return { tipo: 'chegada', statusNovo: 'em_atendimento' };
      },
    );
  }

  async finalizar(id: number, dto: FinalizarDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      this.assertTransicao(chamado, ['em_atendimento']);

      const horas = dto.horasTrabalhadas.toFixed(2);
      const km = dto.kmDeslocamento.toFixed(2);
      chamado.horasTrabalhadas = horas;
      chamado.kmDeslocamento = km;
      chamado.status = 'finalizado';
      chamado.finalizadoEm = new Date();
      await manager.getRepository(Chamado).save(chamado);

      // Regenera linhas auto de execução (mão de obra + deslocamento).
      await manager.getRepository(ChamadoLineItem).delete({
        chamadoId: id,
        origem: 'auto_snapshot',
        tipo: 'servico',
      });
      await manager.getRepository(ChamadoLineItem).delete({
        chamadoId: id,
        origem: 'auto_snapshot',
        tipo: 'deslocamento',
      });

      const valorHora = chamado.snapValorHora;
      if (valorHora && Number(valorHora) > 0 && dto.horasTrabalhadas > 0) {
        await manager.getRepository(ChamadoLineItem).insert({
          chamadoId: id,
          natureza: 'custo',
          tipo: 'servico',
          descricao: `Mão de obra (${horas}h)`,
          quantidade: horas,
          valorUnitario: valorHora,
          valorTotal: multiplyMoney(horas, valorHora),
          origem: 'auto_snapshot',
          createdByUserId: user.userId,
        });
      }
      const custoKm = chamado.snapCustoKmCidade ?? chamado.snapCustoPorKm;
      if (custoKm && Number(custoKm) > 0 && dto.kmDeslocamento > 0) {
        await manager.getRepository(ChamadoLineItem).insert({
          chamadoId: id,
          natureza: 'custo',
          tipo: 'deslocamento',
          descricao: `Deslocamento (${km} km)`,
          quantidade: km,
          valorUnitario: custoKm,
          valorTotal: multiplyMoney(km, custoKm),
          origem: 'auto_snapshot',
          createdByUserId: user.userId,
        });
      }
      await this.recomputeTotals(manager, id);

      const semRat =
        (await manager.getRepository(ChamadoRat).count({
          where: { chamadoId: id },
        })) === 0;

      await this.logEvent(manager, id, user, {
        tipo: 'finalizado',
        statusAnterior: 'em_atendimento',
        statusNovo: 'finalizado',
        nota: dto.observacao ?? null,
        metadata: { horasTrabalhadas: horas, kmDeslocamento: km, semRat },
      });

      // Avisa admins para conferência.
      const admins = await manager.getRepository(User).find({
        where: { role: { name: ROLE_SUPER_ADMIN }, isActive: true },
      });
      this.notifyAfter(() =>
        this.notifier.notifyChamadoFinalizado(
          {
            id: chamado.id,
            codigo: chamado.codigo,
            titulo: chamado.titulo,
            status: chamado.status,
          },
          admins.map((a) => ({ email: a.email, name: a.name })),
        ),
      );

      const result = await this.findOneTx(manager, id, user);
      return { ...result, avisoSemRat: semRat };
    });
  }

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
      let destino: ChamadoStatus;
      if (chamado.status === 'cancelado') {
        destino = 'aberto';
        chamado.canceladoEm = null;
        chamado.motivoCancelamento = null;
        // Cancelado volta a aberto e perde a atribuição/snapshot.
        chamado.tecnicoUserId = null;
        chamado.techProfileId = null;
        chamado.snapTecnicoNome = null;
        chamado.snapTecnicoEmail = null;
        chamado.snapValorHora = null;
        chamado.snapCustoPorKm = null;
        chamado.snapCustoKmCidade = null;
      } else {
        // finalizado/fechado voltam para execução.
        destino = 'em_atendimento';
      }

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
      chamado.finalizadoEm =
        destino === 'em_atendimento' ? null : chamado.finalizadoEm;
      chamado.status = destino;
      chamado.reabertoEm = new Date();
      chamado.motivoReabertura = dto.motivo;
      await manager.getRepository(Chamado).save(chamado);

      await this.logEvent(manager, id, user, {
        tipo: 'reaberto',
        statusAnterior,
        statusNovo: destino,
        nota: dto.motivo,
      });

      if (chamado.tecnicoUserId && chamado.snapTecnicoEmail) {
        this.notifyAfter(() =>
          this.notifier.notifyChamadoReaberto(
            {
              id: chamado.id,
              codigo: chamado.codigo,
              titulo: chamado.titulo,
              status: chamado.status,
            },
            {
              email: chamado.snapTecnicoEmail as string,
              name: chamado.snapTecnicoNome ?? '',
            },
            dto.motivo,
          ),
        );
      }
      return this.findOneTx(manager, id, user);
    });
  }

  async cancelar(id: number, dto: MotivoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertTransicao(chamado, [
        'aberto',
        'solicitado',
        'atribuido',
        'a_caminho',
        'em_atendimento',
        'finalizado',
      ]);
      const statusAnterior = chamado.status;
      chamado.status = 'cancelado';
      chamado.canceladoEm = new Date();
      chamado.motivoCancelamento = dto.motivo;
      chamado.paymentStatus = 'nao_aplicavel';
      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, {
        tipo: 'cancelado',
        statusAnterior,
        statusNovo: 'cancelado',
        nota: dto.motivo,
      });
      return this.findOneTx(manager, id, user);
    });
  }

  // ============================================================ aceite de solicitação

  /** Técnico aceita a solicitação: 'solicitado' -> 'atribuido'. */
  async aceitar(id: number, user: AuthUser) {
    return this.transicaoDono(id, user, ['solicitado'], (chamado) => {
      chamado.status = 'atribuido';
      return {
        tipo: 'solicitacao_aceita',
        statusNovo: 'atribuido',
      };
    });
  }

  /** Técnico recusa a solicitação: chamado volta para 'aberto' sem técnico. */
  async recusar(id: number, dto: MotivoDto, user: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      this.assertTransicao(chamado, ['solicitado']);

      const statusAnterior = chamado.status;
      chamado.tecnicoUserId = null;
      chamado.techProfileId = null;
      chamado.snapTecnicoNome = null;
      chamado.snapTecnicoEmail = null;
      chamado.snapValorHora = null;
      chamado.snapCustoPorKm = null;
      chamado.snapCustoKmCidade = null;
      chamado.status = 'aberto';
      chamado.atribuidoEm = null;
      chamado.aCaminhoEm = null;
      chamado.chegadaEm = null;
      await manager.getRepository(Chamado).save(chamado);

      await manager
        .getRepository(ChamadoLineItem)
        .delete({ chamadoId: id, origem: 'auto_snapshot' });
      await this.recomputeTotals(manager, id);

      await this.logEvent(manager, id, user, {
        tipo: 'solicitacao_recusada',
        statusAnterior,
        statusNovo: 'aberto',
        nota: dto.motivo,
      });
      return this.findOneTx(manager, id, user);
    });
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

  // ============================================================ RAT

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

  /** Gera uma signed upload URL para o cliente subir o arquivo da RAT. */
  async createRatUploadUrl(id: number, fileName: string, user: AuthUser) {
    await this.assertPodeAnexarRat(id, user);
    // Sanitiza o nome; o path é sempre montado pelo servidor (nunca do cliente).
    const safeName = (fileName || 'rat').replace(/[^\w.-]+/g, '_').slice(-80);
    // Timestamp determinístico do lado do servidor via SEQUENCE-free unique-ish:
    // usa now() do banco para evitar Date.now() indisponível aqui.
    const rows: { ts: string }[] = await this.dataSource.query(
      `SELECT to_char(now(), 'YYYYMMDD"T"HH24MISSMS') AS ts`,
    );
    const path = `chamados/${id}/${rows[0].ts}-${safeName}`;
    const signed = await this.storage.createSignedUploadUrl(path);
    return { ...signed, fileName: safeName };
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

  // ============================================================ util transição dono

  private assertDono(chamado: Chamado, user: AuthUser) {
    if (chamado.tecnicoUserId !== user.userId) {
      throw new ForbiddenException('Ação restrita ao técnico do chamado');
    }
  }

  private async transicaoDono(
    id: number,
    user: AuthUser,
    permitidos: ChamadoStatus[],
    mutate: (c: Chamado) => {
      tipo: string;
      statusNovo: string;
      nota?: string;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const chamado = await this.loadOrFail(id, manager);
      this.assertDono(chamado, user);
      this.assertTransicao(chamado, permitidos);
      const statusAnterior = chamado.status;
      const ev = mutate(chamado);
      await manager.getRepository(Chamado).save(chamado);
      await this.logEvent(manager, id, user, {
        tipo: ev.tipo,
        statusAnterior,
        statusNovo: ev.statusNovo,
        nota: ev.nota ?? null,
      });
      return this.findOneTx(manager, id, user);
    });
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
      },
    });
    return this.serialize(chamado as Chamado, user, { includeLineItems: true });
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
      clientId: chamado.clientId,
      client: chamado.client
        ? {
            id: chamado.client.id,
            nome: chamado.client.nome,
            tipo: chamado.client.tipo,
          }
        : null,
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

    // Receita/margem e recebimento do cliente só para quem tem financeiro.ver.
    if (podeFin) {
      base.valorClienteTotal = chamado.valorClienteTotal;
      base.margem = sumMoney([
        chamado.valorClienteTotal,
        `-${chamado.custoTecnicoTotal}`,
      ]);
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
        natureza: i.natureza,
        tipo: i.tipo,
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
        valorTotal: i.valorTotal,
        origem: i.origem,
      }));
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
