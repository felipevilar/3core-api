import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { TechProfile } from './entities/tech-profile.entity';
import { TechServiceArea } from './entities/tech-service-area.entity';
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { RegisterTechDto } from './dto/register-tech.dto';
import { ListTechniciansQueryDto } from './dto/list-technicians.query.dto';
import { ROLE_TECNICO } from '../auth/permissions.catalog';

const BCRYPT_ROUNDS = 12;

/** Custo BR ("130,00" / "1.000,50") → numeric string ou null. */
function parseCustoKm(raw?: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/\./g, '').replace(',', '.').trim();
  return normalized.length ? normalized : null;
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
    const qb = this.profileRepo
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .leftJoin('p.city', 'city')
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
      .orderBy('u.name', 'ASC');

    if (query.search) {
      qb.andWhere('(u.name ILIKE :search OR u.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.uf) {
      qb.andWhere('city.uf = :uf', { uf: query.uf.toUpperCase() });
    }
    if (query.cidade) {
      qb.andWhere('city.searchName LIKE :cidade', {
        cidade: `%${this.normalize(query.cidade)}%`,
      });
    }
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

    return qb.getRawMany();
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
    return term
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }
}
