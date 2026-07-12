import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ClientType } from '../entities/client.entity';

export class CreateClientDto {
  @IsIn(['pf', 'pj'])
  tipo: ClientType;

  @IsString()
  @MinLength(2)
  nome: string;

  // ---- PJ ----
  @IsOptional() @IsString() nomeFantasia?: string;
  @IsOptional() @IsString() cnpj?: string;

  // ---- PF ----
  @IsOptional() @IsString() cpf?: string;

  // ---- Contato ----
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() contatoNome?: string;

  // ---- Endereço ----
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  // Cidade por código IBGE.
  @IsOptional() @IsInt() cityCode?: number;

  @IsOptional() @IsString() observacoes?: string;

  @IsOptional() @IsBoolean() ativo?: boolean;
}
