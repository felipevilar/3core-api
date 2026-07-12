import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';

/** Só dígitos, ou null quando vazio. */
function onlyDigits(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length ? digits : null;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  list(query: ListClientsQueryDto) {
    const qb = this.clientRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.city', 'city')
      .orderBy('c.nome', 'ASC');

    if (query.tipo) {
      qb.andWhere('c.tipo = :tipo', { tipo: query.tipo });
    }
    if (query.uf) {
      qb.andWhere('city.uf = :uf', { uf: query.uf.toUpperCase() });
    }
    if (query.cidade) {
      qb.andWhere('city.searchName LIKE :cidade', {
        cidade: `%${this.normalize(query.cidade)}%`,
      });
    }
    if (query.search) {
      qb.andWhere(
        `(c.nome ILIKE :s OR c."nomeFantasia" ILIKE :s OR c.email ILIKE :s
          OR c.cnpj ILIKE :s OR c.cpf ILIKE :s)`,
        { s: `%${query.search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: number) {
    const client = await this.clientRepo.findOne({
      where: { id },
      relations: { city: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return client;
  }

  async create(dto: CreateClientDto) {
    const cnpj = onlyDigits(dto.cnpj);
    const cpf = onlyDigits(dto.cpf);
    await this.assertDocumentsFree(cnpj, cpf);

    const client = this.clientRepo.create({
      ...dto,
      cnpj,
      cpf,
      ativo: dto.ativo ?? true,
    });
    return this.clientRepo.save(client);
  }

  async update(id: number, dto: UpdateClientDto) {
    // Sem a relação `city` carregada, para não conflitar com a coluna cityCode.
    const client = await this.clientRepo.findOneBy({ id });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const cnpj = dto.cnpj !== undefined ? onlyDigits(dto.cnpj) : client.cnpj;
    const cpf = dto.cpf !== undefined ? onlyDigits(dto.cpf) : client.cpf;
    await this.assertDocumentsFree(cnpj, cpf, id);

    Object.assign(client, dto, { cnpj, cpf });
    await this.clientRepo.save(client);
    return this.findOne(id);
  }

  async remove(id: number) {
    const client = await this.findOne(id);
    await this.clientRepo.remove(client);
    return { success: true };
  }

  /** Garante unicidade de CPF/CNPJ (ignorando o próprio registro em edições). */
  private async assertDocumentsFree(
    cnpj: string | null,
    cpf: string | null,
    ignoreId?: number,
  ) {
    if (cnpj) {
      const where = ignoreId
        ? { cnpj, id: Not(ignoreId) }
        : { cnpj };
      if (await this.clientRepo.findOneBy(where)) {
        throw new ConflictException('Já existe um cliente com este CNPJ');
      }
    }
    if (cpf) {
      const where = ignoreId ? { cpf, id: Not(ignoreId) } : { cpf };
      if (await this.clientRepo.findOneBy(where)) {
        throw new ConflictException('Já existe um cliente com este CPF');
      }
    }
  }

  /** Normaliza para busca por cidade: sem acento, minúsculo. */
  private normalize(term: string): string {
    return term
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }
}
