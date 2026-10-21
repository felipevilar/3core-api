import {
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ChamadoPrioridade } from '../entities/chamado.entity';
import { IsIn } from 'class-validator';

const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

export class CreateChamadoDto {
  @IsInt() clientId: number;

  // Opcional quando há `servicoId` (título herda o nome do serviço).
  @IsOptional() @IsString() @MinLength(2) titulo?: string;

  @IsOptional() @IsInt() servicoId?: number;

  @IsOptional() @IsString() descricao?: string;

  @IsOptional() @IsString() chamadoInterno?: string;
  @IsOptional() @IsString() chamadoExterno?: string;

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

  // Local (site) do cliente: copia endereço/coords/contato/códigos do local.
  // Campos informados explicitamente abaixo prevalecem sobre os do local.
  @IsOptional() @IsInt() localId?: number;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() contatoLocalNome?: string;
  @IsOptional() @IsString() contatoLocalTelefone?: string;
  @IsOptional() @IsString() codigoCheckin?: string;
  @IsOptional() @IsString() codigoCheckout?: string;

  @IsOptional() @IsISO8601() agendadoPara?: string;
}
