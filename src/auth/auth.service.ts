import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './jwt.strategy';

export interface SafeUser {
  id: number;
  email: string;
  name: string;
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
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; user: SafeUser }> {
    // passwordHash tem select:false — precisamos pedir explicitamente.
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
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

    return { accessToken, user: this.toSafeUser(user, permissions) };
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

  private toSafeUser(user: User, permissions: string[]): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
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
