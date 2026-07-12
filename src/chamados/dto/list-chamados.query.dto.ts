import { IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

const STATUSES = [
  'aberto',
  'atribuido',
  'a_caminho',
  'em_atendimento',
  'finalizado',
  'fechado',
  'cancelado',
];
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

/** Filtros da listagem de chamados (todos opcionais). */
export class ListChamadosQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(PRIORIDADES) prioridade?: string;
  @IsOptional() @Type(() => Number) @IsInt() clientId?: number;
  @IsOptional() @Type(() => Number) @IsInt() tecnicoUserId?: number;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;
  // Competência YYYY-MM (folha).
  @IsOptional() @IsString() @Length(7, 7) periodo?: string;
}
