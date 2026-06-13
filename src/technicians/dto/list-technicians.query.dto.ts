import { IsOptional, IsString } from 'class-validator';

/** Filtros da listagem de técnicos (todos opcionais, casamento parcial). */
export class ListTechniciansQueryDto {
  /** Busca por nome ou e-mail. */
  @IsOptional() @IsString() search?: string;

  /** Cidade de residência (campo `cidade` do perfil). */
  @IsOptional() @IsString() cidade?: string;

  /** Cidade presente na lista de cidades atendidas. */
  @IsOptional() @IsString() cidadeAtendida?: string;
}
