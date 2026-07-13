import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ChamadoPrioridade } from '../entities/chamado.entity';
import { IsIn } from 'class-validator';

const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

export class CreateChamadoDto {
  @IsInt() clientId: number;

  @IsString() @MinLength(2) titulo: string;

  @IsOptional() @IsString() descricao?: string;

  @IsOptional() @IsIn(PRIORIDADES) prioridade?: ChamadoPrioridade;

  // Cidade do atendimento — obrigatória (pode diferir da cidade do cliente).
  @IsInt() cityCode: number;

  // Endereço do atendimento — todo opcional.
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() pontoReferencia?: string;

  @IsOptional() @IsISO8601() agendadoPara?: string;
}
