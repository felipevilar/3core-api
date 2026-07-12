import { IsOptional, IsString, Length } from 'class-validator';

/** Filtros da listagem de técnicos (todos opcionais, casamento parcial). */
export class ListTechniciansQueryDto {
  /** Busca por nome ou e-mail. */
  @IsOptional() @IsString() search?: string;

  /** UF de residência (sigla). */
  @IsOptional() @IsString() @Length(2, 2) uf?: string;

  /** Cidade de residência (nome, casamento parcial). */
  @IsOptional() @IsString() cidade?: string;

  /** Cidade presente na lista de cidades atendidas (nome). */
  @IsOptional() @IsString() cidadeAtendida?: string;
}
