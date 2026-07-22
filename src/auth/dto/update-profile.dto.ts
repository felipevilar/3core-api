import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;
}

export class AvatarUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;
}

export class ConfirmAvatarDto {
  @IsString()
  @IsNotEmpty()
  storagePath: string;
}
