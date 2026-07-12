import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from './entities/city.entity';

/** Normaliza para busca: sem acento, minúsculo. */
function normalize(term: string): string {
  return term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

@Injectable()
export class CitiesService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepo: Repository<City>,
  ) {}

  /** Autocomplete por nome (prefixo), opcionalmente filtrando por UF. */
  search(term: string, uf?: string, limit = 10) {
    const norm = normalize(term);
    if (norm.length < 2) return Promise.resolve([]);

    const qb = this.cityRepo
      .createQueryBuilder('c')
      .where('c.searchName LIKE :prefix', { prefix: `${norm}%` })
      .orderBy('c.nome', 'ASC')
      .limit(Math.min(limit, 30));

    if (uf) {
      qb.andWhere('c.uf = :uf', { uf: uf.toUpperCase() });
    }
    return qb.getMany();
  }

  findByCode(code: number) {
    return this.cityRepo.findOneBy({ code });
  }

  /** Lista as 27 UFs (sigla + nome + região) para filtros. */
  async listUfs() {
    const rows = await this.cityRepo
      .createQueryBuilder('c')
      .select('c.uf', 'uf')
      .addSelect('c.ufNome', 'ufNome')
      .addSelect('c.regiao', 'regiao')
      .distinct(true)
      .orderBy('c.uf', 'ASC')
      .getRawMany<{ uf: string; ufNome: string; regiao: string }>();
    return rows;
  }
}
