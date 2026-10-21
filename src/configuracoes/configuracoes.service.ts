import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { APP_CONFIG_ID, AppConfig } from './entities/app-config.entity';
import { SlaPolitica } from './entities/sla-politica.entity';
import { Motivo, MotivoTipo } from './entities/motivo.entity';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import {
  CreateSlaPoliticaDto,
  UpdateSlaPoliticaDto,
} from './dto/sla-politica.dto';
import { CreateMotivoDto, UpdateMotivoDto } from './dto/motivo.dto';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

/** Valores padrão quando a linha ainda não existe (banco recém-migrado). */
const DEFAULTS: Omit<AppConfig, 'updatedAt'> = {
  id: APP_CONFIG_ID,
  ratObrigatoria: false,
  assinaturaObrigatoria: false,
  geolocalizacaoObrigatoria: false,
  avaliacaoHabilitada: true,
  solicitacaoExpiraHoras: null,
  permitirAgendarNoPassado: true,
  updatedByUserId: null,
};

@Injectable()
export class ConfiguracoesService {
  constructor(
    @InjectRepository(AppConfig)
    private readonly repo: Repository<AppConfig>,
    @InjectRepository(SlaPolitica)
    private readonly slaRepo: Repository<SlaPolitica>,
    @InjectRepository(Motivo)
    private readonly motivoRepo: Repository<Motivo>,
  ) {}

  // ============================================================ app config

  /** Configuração vigente (linha única). */
  async get(): Promise<AppConfig> {
    const row = await this.repo.findOneBy({ id: APP_CONFIG_ID });
    return row ?? { ...DEFAULTS, updatedAt: new Date() };
  }

  async update(dto: UpdateAppConfigDto, user: AuthUser): Promise<AppConfig> {
    const current = await this.get();
    const next = this.repo.create({
      ...current,
      ...stripUndefined(dto),
      id: APP_CONFIG_ID,
      updatedByUserId: user.userId,
    });
    await this.repo.save(next);
    return this.get();
  }

  // ============================================================ SLA

  listSla() {
    return this.slaRepo.find({
      order: { clientId: 'ASC', prioridade: 'ASC', nome: 'ASC' },
    });
  }

  async createSla(dto: CreateSlaPoliticaDto) {
    this.assertSlaTemPrazo(dto);
    return this.slaRepo.save(
      this.slaRepo.create({
        nome: dto.nome,
        clientId: dto.clientId ?? null,
        prioridade: dto.prioridade ?? null,
        horasPrimeiraVisita: dto.horasPrimeiraVisita ?? null,
        horasConclusao: dto.horasConclusao ?? null,
        ativo: dto.ativo ?? true,
      }),
    );
  }

  async updateSla(id: number, dto: UpdateSlaPoliticaDto) {
    const sla = await this.slaRepo.findOneBy({ id });
    if (!sla) throw new NotFoundException('Política de SLA não encontrada');
    Object.assign(sla, stripUndefined(dto));
    this.assertSlaTemPrazo(sla);
    return this.slaRepo.save(sla);
  }

  async removeSla(id: number) {
    const sla = await this.slaRepo.findOneBy({ id });
    if (!sla) throw new NotFoundException('Política de SLA não encontrada');
    await this.slaRepo.remove(sla);
    return { success: true };
  }

  private assertSlaTemPrazo(p: {
    horasPrimeiraVisita?: number | null;
    horasConclusao?: number | null;
  }) {
    if (!p.horasPrimeiraVisita && !p.horasConclusao) {
      throw new BadRequestException(
        'Informe ao menos um prazo (1ª visita ou conclusão)',
      );
    }
  }

  /**
   * Política aplicável a um chamado: cliente+prioridade > cliente > prioridade
   * > geral. Null quando não há política ativa.
   */
  async resolveSla(
    clientId: number,
    prioridade: string,
  ): Promise<SlaPolitica | null> {
    const candidatas = await this.slaRepo.find({
      where: [
        { ativo: true, clientId, prioridade },
        { ativo: true, clientId, prioridade: IsNull() },
        { ativo: true, clientId: IsNull(), prioridade },
        { ativo: true, clientId: IsNull(), prioridade: IsNull() },
      ],
    });
    const score = (p: SlaPolitica) =>
      (p.clientId ? 2 : 0) + (p.prioridade ? 1 : 0);
    return (
      candidatas.sort((a, b) => score(b) - score(a) || a.id - b.id)[0] ?? null
    );
  }

  // ============================================================ motivos

  listMotivos(tipo?: MotivoTipo, incluirInativos = false) {
    return this.motivoRepo.find({
      where: {
        ...(tipo ? { tipo } : {}),
        ...(incluirInativos ? {} : { ativo: true }),
      },
      order: { tipo: 'ASC', ordem: 'ASC', nome: 'ASC' },
    });
  }

  createMotivo(dto: CreateMotivoDto) {
    return this.motivoRepo.save(
      this.motivoRepo.create({
        tipo: dto.tipo,
        nome: dto.nome,
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      }),
    );
  }

  async updateMotivo(id: number, dto: UpdateMotivoDto) {
    const motivo = await this.motivoRepo.findOneBy({ id });
    if (!motivo) throw new NotFoundException('Motivo não encontrado');
    Object.assign(motivo, stripUndefined(dto));
    return this.motivoRepo.save(motivo);
  }

  async removeMotivo(id: number) {
    const motivo = await this.motivoRepo.findOneBy({ id });
    if (!motivo) throw new NotFoundException('Motivo não encontrado');
    motivo.ativo = false;
    await this.motivoRepo.save(motivo);
    return { success: true };
  }

  /** Valida um motivo informado numa ação (deve existir e ser do tipo certo). */
  async motivoOrFail(id: number | undefined, tipo: MotivoTipo) {
    if (id === undefined || id === null) return null;
    const motivo = await this.motivoRepo.findOneBy({ id });
    if (!motivo || motivo.tipo !== tipo) {
      throw new BadRequestException(`Motivo inválido para ${tipo}`);
    }
    return motivo;
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
