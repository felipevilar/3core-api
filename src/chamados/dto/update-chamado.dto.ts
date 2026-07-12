import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ChamadoPrioridade } from '../entities/chamado.entity';

const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

/** Edição de campos livres. Bloqueado se fechado/cancelado (no service). */
export class UpdateChamadoDto {
  @IsOptional() @IsString() @MinLength(2) titulo?: string;
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsIn(PRIORIDADES) prioridade?: ChamadoPrioridade;

  // Trocar a cidade re-congela o snapshot de custo/km (só admin, no service).
  @IsOptional() @IsInt() cityCode?: number;

  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;

  @IsOptional() @IsISO8601() agendadoPara?: string;
}
