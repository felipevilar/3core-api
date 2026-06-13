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
import { User } from '../auth/entities/user.entity';
import { Role } from '../auth/entities/role.entity';
import { RegisterTechDto } from './dto/register-tech.dto';
import { ListTechniciansQueryDto } from './dto/list-technicians.query.dto';
import { ROLE_TECNICO } from '../auth/permissions.catalog';

const BCRYPT_ROUNDS = 12;

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
   * (nome/e-mail, cidade de residência e cidade atendida). Não retorna
   * dados sensíveis (CPF/pagamento) — esses ficam na ficha (`findOne`).
   */
  async list(query: ListTechniciansQueryDto) {
    const qb = this.profileRepo
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .select([
        'p.id AS id',
        'u.id AS "userId"',
        'u.name AS name',
        'u.email AS email',
        'u.isActive AS "isActive"',
        'p.celular AS celular',
        'p.cidade AS cidade',
        'p.estado AS estado',
        'p.areasAtuacao AS "areasAtuacao"',
        'p.cidadesAtendidas AS "cidadesAtendidas"',
        'p.createdAt AS "createdAt"',
      ])
      .orderBy('u.name', 'ASC');

    if (query.search) {
      qb.andWhere('(u.name ILIKE :search OR u.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.cidade) {
      qb.andWhere('p.cidade ILIKE :cidade', { cidade: `%${query.cidade}%` });
    }
    if (query.cidadeAtendida) {
      // Procura a cidade entre os objetos {cidade, custoKm} do JSONB.
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM jsonb_array_elements(p."cidadesAtendidas") AS c
          WHERE c->>'cidade' ILIKE :cidadeAtendida
        )`,
        { cidadeAtendida: `%${query.cidadeAtendida}%` },
      );
    }

    return qb.getRawMany();
  }

  /** Ficha completa do técnico (perfil + dados do usuário). */
  async findOne(id: number) {
    const profile = await this.profileRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!profile) {
      throw new NotFoundException('Técnico não encontrado');
    }
    return profile;
  }

  /**
   * Cadastro vindo da landing page: cria o usuário (papel `tecnico`) + perfil,
   * em transação, liberando acesso imediato ao dashboard.
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
        cidade: dto.endereco?.cidade ?? null,
        estado: dto.endereco?.estado ?? null,
        enderecoEncomendas: dto.enderecoEncomendas ?? null,
        pretensaoValorHora: dto.pretensaoValorHora ?? null,
        custoPorKm: dto.custoPorKm ?? null,
        pagamento: dto.pagamento ?? null,
        empresa: dto.empresa ?? null,
        areasAtuacao: dto.areasAtuacao ?? null,
        ferramental: dto.ferramental ?? null,
        cidadesAtendidas: dto.cidadesAtendidas ?? null,
      });
      await manager.save(profile);

      return {
        success: true,
        userId: savedUser.id,
        email: savedUser.email,
        name: savedUser.name,
      };
    });
  }
}
