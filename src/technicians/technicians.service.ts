import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { TechProfile } from './entities/tech-profile.entity';
import { TechServiceArea } from './entities/tech-service-area.entity';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { RegisterTechDto } from './dto/register-tech.dto';
import { ListTechniciansQueryDto } from './dto/list-technicians.query.dto';
import { CreateTechnicianDto } from './dto/create-technician.dto';
import { UpdateTechnicianDto } from './dto/update-technician.dto';
import { ROLE_TECNICO } from '../auth/permissions.catalog';
import { parseBrMoney } from '../common/br-money';

const BCRYPT_ROUNDS = 12;

/**
 * Custo (R$/km) para numeric string. Usa o parser BR compartilhado, que é
 * IDEMPOTENTE: aceita entrada BR ("1,50") e também o valor já normalizado que
 * volta do banco ("1.50") sem multiplicar por 100 no round-trip de edição.
 */
function parseCustoKm(raw?: string | null): string | null {
  return parseBrMoney(raw);
}

@Injectable()
export class TechniciansService {
  constructor(
    @InjectRepository(TechProfile)
    private readonly profileRepo: Repository<TechProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Lista enxuta para a tabela do dashboard, com filtros opcionais
   * (nome/e-mail, UF/cidade de residência e cidade atendida). Não retorna
   * dados sensíveis (CPF/pagamento) — esses ficam na ficha (`findOne`).
   */
  async list(query: ListTechniciansQueryDto) {
    // Aplica os mesmos filtros à contagem e à página.
    const applyFilters = (qb: SelectQueryBuilder<TechProfile>) => {
      if (query.search) {
        qb.andWhere('(u.name ILIKE :search OR u.email ILIKE :search)', {
          search: `%${query.search}%`,
        });
      }
      if (query.uf?.length) {
        qb.andWhere('city.uf IN (:...ufs)', {
          ufs: query.uf.map((u) => u.toUpperCase()),
        });
      }
      if (query.status === 'ativo') qb.andWhere('u.isActive = true');
      if (query.status === 'inativo') qb.andWhere('u.isActive = false');
      if (query.cidadeAtendida) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM tech_service_areas sa
            JOIN cities sc ON sc.code = sa."cityCode"
            WHERE sa."techProfileId" = p.id
              AND sc.searchName LIKE :cidadeAtendida
          )`,
          { cidadeAtendida: `%${this.normalize(query.cidadeAtendida)}%` },
        );
      }
      return qb;
    };

    const pageSize = query.pageSize ?? 50;
    const page = query.page && query.page > 0 ? query.page : 1;

    // Contagem do total filtrado.
    const countQb = applyFilters(
      this.profileRepo
        .createQueryBuilder('p')
        .innerJoin('p.user', 'u')
        .leftJoin('p.city', 'city'),
    );
    const total = await countQb.getCount();

    // Página (getRawMany por causa das colunas agregadas).
    const qb = applyFilters(
      this.profileRepo
        .createQueryBuilder('p')
        .innerJoin('p.user', 'u')
        .leftJoin('p.city', 'city'),
    )
      .select([
        'p.id AS id',
        'u.id AS "userId"',
        'u.name AS name',
        'u.email AS email',
        'u.isActive AS "isActive"',
        'p.celular AS celular',
        'p.cityCode AS "cityCode"',
        'city.nome AS "cidadeNome"',
        'city.uf AS uf',
        'p.areasAtuacao AS "areasAtuacao"',
        'p.createdAt AS "createdAt"',
        // Cidades atendidas como array agregado (nome + uf) para a linha.
        `COALESCE((
          SELECT json_agg(json_build_object('code', sc.code, 'nome', sc.nome, 'uf', sc.uf) ORDER BY sc.nome)
          FROM tech_service_areas sa
          JOIN cities sc ON sc.code = sa."cityCode"
          WHERE sa."techProfileId" = p.id
        ), '[]') AS "cidadesAtendidas"`,
      ])
      .orderBy('u.name', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    const items = await qb.getRawMany();
    return { items, total, page, pageSize };
  }

  /** Ficha completa do técnico (perfil + usuário + cidade + áreas atendidas). */
  async findOne(id: number) {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: {
        user: true,
        city: true,
        servedCities: { city: true },
      },
    });
    if (!profile) {
      throw new NotFoundException('Técnico não encontrado');
    }
    return profile;
  }

  /**
   * Cadastro vindo da landing page: cria o usuário (papel `tecnico`) + perfil
   * + cidades atendidas, em transação, liberando acesso imediato ao dashboard.
   */
  async registerFromLanding(dto: RegisterTechDto) {
    // Unicidade amigável antes da transação (a constraint do banco é a garantia final).
    const cpfDigits = dto.cpf.replace(/\D/g, '');
    const [emailTaken, cpfTaken] = await Promise.all([
      this.userRepo.findOneBy({ email: dto.email }),
      this.profileRepo.findOneBy({ cpf: cpfDigits }),
    ]);
    if (emailTaken) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
    if (cpfTaken) {
      throw new ConflictException('Já existe um cadastro com este CPF');
    }

    const tecnicoRole = await this.roleRepo.findOneBy({ name: ROLE_TECNICO });
    if (!tecnicoRole) {
      throw new InternalServerErrorException('Papel "tecnico" não configurado');
    }

    const passwordHash = await bcrypt.hash(dto.senha, BCRYPT_ROUNDS);

    // Deduplica cidades atendidas por código (unicidade em tech_service_areas).
    const servedCities = this.dedupeServiceAreas(dto.cidadesAtendidas);

    return this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email: dto.email,
        passwordHash,
        name: dto.nome,
        isActive: true,
        roleId: tecnicoRole.id,
      });
      const savedUser = await manager.save(user);

      const profile = manager.create(TechProfile, {
        userId: savedUser.id,
        cpf: cpfDigits,
        rg: dto.rg ?? null,
        celular: dto.celular,
        cep: dto.endereco?.cep ?? null,
        logradouro: dto.endereco?.logradouro ?? null,
        numero: dto.endereco?.numero ?? null,
        complemento: dto.endereco?.complemento ?? null,
        bairro: dto.endereco?.bairro ?? null,
        cityCode: dto.endereco?.cityCode ?? null,
        enderecoEncomendas: dto.enderecoEncomendas ?? null,
        pretensaoValorHora: dto.pretensaoValorHora ?? null,
        custoPorKm: dto.custoPorKm ?? null,
        pagamento: dto.pagamento ?? null,
        empresa: dto.empresa ?? null,
        areasAtuacao: dto.areasAtuacao ?? null,
        ferramental: dto.ferramental ?? null,
      });
      const savedProfile = await manager.save(profile);

      if (servedCities.length) {
        const areas = servedCities.map((c) =>
          manager.create(TechServiceArea, {
            techProfileId: savedProfile.id,
            cityCode: c.cityCode,
            custoKm: parseCustoKm(c.custoKm),
          }),
        );
        await manager.save(areas);
      }

      return {
        success: true,
        userId: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
      };
    });
  }

  /**
   * Criação de técnico pelo dashboard (admin define a senha). Cria usuário
   * (papel `tecnico`) + perfil + cidades atendidas, em transação.
   */
  async create(dto: CreateTechnicianDto) {
    const cpfDigits = dto.cpf.replace(/\D/g, '');
    const [emailTaken, cpfTaken] = await Promise.all([
      this.userRepo.findOneBy({ email: dto.email }),
      this.profileRepo.findOneBy({ cpf: cpfDigits }),
    ]);
    if (emailTaken) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
    if (cpfTaken) {
      throw new ConflictException('Já existe um cadastro com este CPF');
    }

    const tecnicoRole = await this.roleRepo.findOneBy({ name: ROLE_TECNICO });
    if (!tecnicoRole) {
      throw new InternalServerErrorException('Papel "tecnico" não configurado');
    }

    const passwordHash = await bcrypt.hash(dto.senha, BCRYPT_ROUNDS);
    const servedCities = this.dedupeServiceAreas(dto.cidadesAtendidas);

    const savedId = await this.runWithUniqueGuard(async () =>
      this.dataSource.transaction(async (manager) => {
        const user = manager.create(User, {
          email: dto.email,
          passwordHash,
          name: dto.nome,
          isActive: dto.isActive ?? true,
          roleId: tecnicoRole.id,
        });
        const savedUser = await manager.save(user);

        const profile = manager.create(TechProfile, {
          userId: savedUser.id,
          cpf: cpfDigits,
          rg: dto.rg ?? null,
          celular: dto.celular,
          cep: dto.endereco?.cep ?? null,
          logradouro: dto.endereco?.logradouro ?? null,
          numero: dto.endereco?.numero ?? null,
          complemento: dto.endereco?.complemento ?? null,
          bairro: dto.endereco?.bairro ?? null,
          cityCode: dto.endereco?.cityCode ?? null,
          enderecoEncomendas: dto.enderecoEncomendas ?? null,
          pretensaoValorHora: dto.pretensaoValorHora ?? null,
          custoPorKm: dto.custoPorKm ?? null,
          pagamento: dto.pagamento ?? null,
          empresa: dto.empresa ?? null,
          areasAtuacao: dto.areasAtuacao ?? null,
          ferramental: dto.ferramental ?? null,
        });
        const savedProfile = await manager.save(profile);

        if (servedCities.length) {
          await manager.save(
            servedCities.map((c) =>
              manager.create(TechServiceArea, {
                techProfileId: savedProfile.id,
                cityCode: c.cityCode,
                custoKm: parseCustoKm(c.custoKm),
              }),
            ),
          );
        }
        return savedProfile.id;
      }),
    );

    return this.findOne(savedId);
  }

  /**
   * Executa uma escrita traduzindo violação de unicidade (Postgres 23505) do
   * banco numa ConflictException amigável — cobre a corrida em que o pré-check
   * passa mas dois cadastros simultâneos batem no mesmo e-mail/CPF.
   */
  private async runWithUniqueGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const err = e as { code?: string; detail?: string };
      if (err?.code === '23505') {
        const detail = err.detail ?? '';
        if (/cpf/i.test(detail)) {
          throw new ConflictException('Já existe um cadastro com este CPF');
        }
        if (/email/i.test(detail)) {
          throw new ConflictException('Já existe uma conta com este e-mail');
        }
        throw new ConflictException('Registro duplicado');
      }
      throw e;
    }
  }

  /** Edição de técnico. Atualiza usuário + perfil; senha só se enviada. */
  async update(id: number, dto: UpdateTechnicianDto) {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!profile) throw new NotFoundException('Técnico não encontrado');

    // Unicidade de e-mail/CPF ao trocar (ignorando o próprio).
    if (dto.email && dto.email !== profile.user.email) {
      const taken = await this.userRepo.findOneBy({ email: dto.email });
      if (taken)
        throw new ConflictException('Já existe uma conta com este e-mail');
    }
    const cpfDigits = dto.cpf ? dto.cpf.replace(/\D/g, '') : undefined;
    if (cpfDigits && cpfDigits !== profile.cpf) {
      const taken = await this.profileRepo.findOneBy({ cpf: cpfDigits });
      if (taken)
        throw new ConflictException('Já existe um cadastro com este CPF');
    }

    const passwordHash = dto.senha
      ? await bcrypt.hash(dto.senha, BCRYPT_ROUNDS)
      : undefined;

    await this.runWithUniqueGuard(async () =>
      this.dataSource.transaction(async (manager) => {
        // ---- usuário ----
        const userPatch: Partial<User> = {};
        if (dto.nome !== undefined) userPatch.name = dto.nome;
        if (dto.email !== undefined) userPatch.email = dto.email;
        if (dto.isActive !== undefined) userPatch.isActive = dto.isActive;
        if (passwordHash) userPatch.passwordHash = passwordHash;
        if (Object.keys(userPatch).length) {
          await manager.update(User, profile.userId, userPatch);
        }

        // ---- perfil (só campos enviados) ----
        const p = profile;
        if (cpfDigits !== undefined) p.cpf = cpfDigits;
        if (dto.rg !== undefined) p.rg = dto.rg;
        if (dto.celular !== undefined) p.celular = dto.celular;
        if (dto.endereco) {
          if (dto.endereco.cep !== undefined) p.cep = dto.endereco.cep;
          if (dto.endereco.logradouro !== undefined)
            p.logradouro = dto.endereco.logradouro;
          if (dto.endereco.numero !== undefined) p.numero = dto.endereco.numero;
          if (dto.endereco.complemento !== undefined)
            p.complemento = dto.endereco.complemento;
          if (dto.endereco.bairro !== undefined) p.bairro = dto.endereco.bairro;
          if (dto.endereco.cityCode !== undefined)
            p.cityCode = dto.endereco.cityCode;
        }
        if (dto.enderecoEncomendas !== undefined)
          p.enderecoEncomendas = dto.enderecoEncomendas;
        if (dto.pretensaoValorHora !== undefined)
          p.pretensaoValorHora = dto.pretensaoValorHora;
        if (dto.custoPorKm !== undefined) p.custoPorKm = dto.custoPorKm;
        if (dto.pagamento !== undefined) p.pagamento = dto.pagamento;
        if (dto.empresa !== undefined) p.empresa = dto.empresa;
        if (dto.areasAtuacao !== undefined) p.areasAtuacao = dto.areasAtuacao;
        if (dto.ferramental !== undefined) p.ferramental = dto.ferramental;
        await manager.save(TechProfile, p);

        // ---- cidades atendidas (substitui a lista inteira se enviada) ----
        if (dto.cidadesAtendidas !== undefined) {
          await manager.delete(TechServiceArea, { techProfileId: id });
          const served = this.dedupeServiceAreas(dto.cidadesAtendidas);
          if (served.length) {
            await manager.save(
              served.map((c) =>
                manager.create(TechServiceArea, {
                  techProfileId: id,
                  cityCode: c.cityCode,
                  custoKm: parseCustoKm(c.custoKm),
                }),
              ),
            );
          }
        }
      }),
    );

    return this.findOne(id);
  }

  /** Ativa/desativa o acesso do técnico (isActive no usuário). */
  async setStatus(id: number, isActive: boolean) {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!profile) throw new NotFoundException('Técnico não encontrado');
    await this.userRepo.update(profile.userId, { isActive });
    return this.findOne(id);
  }

  /**
   * Exclusão definitiva — só permitida se o técnico não tiver histórico
   * (nenhum chamado vinculado). Caso contrário, oriente a desativar.
   */
  async remove(id: number) {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!profile) throw new NotFoundException('Técnico não encontrado');

    // Verificação + exclusão na MESMA transação. Trava as linhas de chamados
    // do técnico (FOR UPDATE nas linhas, não em agregado) para fechar a janela
    // TOCTOU: um chamado atribuído concomitantemente fica bloqueado até o commit.
    await this.dataSource.transaction(async (manager) => {
      const vinculados: { id: number }[] = await manager.query(
        `SELECT id FROM chamados WHERE "tecnicoUserId" = $1 FOR UPDATE`,
        [profile.userId],
      );
      if (vinculados.length > 0) {
        throw new ConflictException(
          'Técnico possui chamados vinculados — desative-o em vez de excluir',
        );
      }
      // Remove o usuário; perfil e service areas caem por ON DELETE CASCADE.
      await manager.delete(User, profile.userId);
    });
    return { success: true };
  }

  private dedupeServiceAreas(
    list?: { cityCode: number; custoKm?: string }[],
  ): { cityCode: number; custoKm?: string }[] {
    if (!list?.length) return [];
    const byCode = new Map<number, { cityCode: number; custoKm?: string }>();
    for (const item of list) {
      byCode.set(item.cityCode, item);
    }
    return [...byCode.values()];
  }

  private normalize(term: string): string {
    return term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
