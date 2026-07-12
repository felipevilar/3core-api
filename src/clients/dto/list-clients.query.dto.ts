import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { ClientType } from '../entities/client.entity';

/** Filtros da listagem de clientes (todos opcionais, casamento parcial). */
export class ListClientsQueryDto {
  /** Busca por nome, nome fantasia, e-mail ou documento. */
  @IsOptional() @IsString() search?: string;

  /** Filtra por tipo (pf/pj). */
  @IsOptional() @IsIn(['pf', 'pj']) tipo?: ClientType;

  /** UF do cliente (sigla). */
  @IsOptional() @IsString() @Length(2, 2) uf?: string;

  /** Cidade do cliente (nome, casamento parcial). */
  @IsOptional() @IsString() cidade?: string;
}
