import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { MOTIVO_TIPOS } from '../entities/motivo.entity';
import type { MotivoTipo } from '../entities/motivo.entity';

export class CreateMotivoDto {
  @IsIn(MOTIVO_TIPOS) tipo: MotivoTipo;
  @IsString() @MinLength(2) nome: string;
  @IsOptional() @IsInt() ordem?: number;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class UpdateMotivoDto {
  @IsOptional() @IsString() @MinLength(2) nome?: string;
  @IsOptional() @IsInt() ordem?: number;
  @IsOptional() @IsBoolean() ativo?: boolean;
}
