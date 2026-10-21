import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Todos opcionais — só o que vier no corpo é alterado. */
export class UpdateAppConfigDto {
  @IsOptional() @IsBoolean() ratObrigatoria?: boolean;
  @IsOptional() @IsBoolean() assinaturaObrigatoria?: boolean;
  @IsOptional() @IsBoolean() geolocalizacaoObrigatoria?: boolean;
  @IsOptional() @IsBoolean() avaliacaoHabilitada?: boolean;
  // null desliga a expiração.
  @IsOptional() @IsInt() @Min(1) @Max(720) solicitacaoExpiraHoras?:
    | number
    | null;
  @IsOptional() @IsBoolean() permitirAgendarNoPassado?: boolean;
}
