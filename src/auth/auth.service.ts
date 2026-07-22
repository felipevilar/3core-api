import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import {
  AvatarUploadUrlDto,
  ConfirmAvatarDto,
  UpdateProfileDto,
} from './dto/update-profile.dto';
import type { JwtPayload } from './jwt.strategy';
import {
  AVATARS_BUCKET,
  StorageService,
} from '../storage/storage.service';

export interface SafeUser {
  id: number;
  email: string;
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  role: { id: number; name: string; description: string | null };
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly storageService: StorageService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; user: SafeUser }> {
    // passwordHash tem select:false — precisamos pedir explicitamente.
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        bio: true,
        avatarPath: true,
        isActive: true,
        passwordHash: true,
        roleId: true,
      },
      relations: { role: { permissions: true } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const permissions = (user.role?.permissions ?? []).map((p) => p.key);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role?.name ?? '',
      permissions,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: await this.toSafeUser(user, permissions),
    };
  }

  /** Relê do banco para refletir mudanças de papel/permissões no reload/login. */
  async me(userId: number): Promise<SafeUser> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { role: { permissions: true } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    const permissions = (user.role?.permissions ?? []).map((p) => p.key);
    return this.toSafeUser(user, permissions);
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<SafeUser> {
    await this.userRepo.update(userId, { bio: dto.bio ?? null });
    return this.me(userId);
  }

  async createAvatarUploadUrl(
    userId: number,
    dto: AvatarUploadUrlDto,
  ): Promise<{ path: string; signedUrl: string }> {
    const safeName = dto.fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const path = `avatars/${userId}/${Date.now()}-${safeName}`;
    const result = await this.storageService.createSignedUploadUrl(
      path,
      AVATARS_BUCKET,
    );
    return { path: result.path, signedUrl: result.signedUrl };
  }

  async confirmAvatar(
    userId: number,
    dto: ConfirmAvatarDto,
  ): Promise<SafeUser> {
    const expectedPrefix = `avatars/${userId}/`;
    if (
      !dto.storagePath.startsWith(expectedPrefix) ||
      dto.storagePath.includes('..') ||
      dto.storagePath.startsWith('/')
    ) {
      throw new BadRequestException('storagePath inválido');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const oldPath = user?.avatarPath;

    await this.userRepo.update(userId, { avatarPath: dto.storagePath });

    if (oldPath) {
      try {
        await this.storageService.remove(oldPath, AVATARS_BUCKET);
      } catch {
        // falha ao remover o avatar antigo não deve bloquear a operação
      }
    }

    return this.me(userId);
  }

  private async toSafeUser(
    user: User,
    permissions: string[],
  ): Promise<SafeUser> {
    let avatarUrl: string | null = null;
    if (user.avatarPath) {
      try {
        const result = await this.storageService.createSignedDownloadUrl(
          user.avatarPath,
          300,
          AVATARS_BUCKET,
        );
        avatarUrl = result.signedUrl;
      } catch {
        // storage não configurado ou path inválido — retorna null
      }
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      bio: user.bio ?? null,
      avatarUrl,
      isActive: user.isActive,
      role: {
        id: user.role?.id,
        name: user.role?.name ?? '',
        description: user.role?.description ?? null,
      },
      permissions,
    };
  }
}
