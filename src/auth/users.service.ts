import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AVATARS_BUCKET, StorageService } from '../storage/storage.service';

const BCRYPT_ROUNDS = 12;

export interface UserWithAvatar {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  avatarUrl: string | null;
  role: { id: number; name: string; description: string | null };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    private readonly storageService: StorageService,
  ) {}

  async findAll(): Promise<UserWithAvatar[]> {
    const users = await this.userRepo.find({ order: { name: 'ASC' } });
    const paths = users
      .map((u) => u.avatarPath)
      .filter((p): p is string => !!p);
    let urlMap: Record<string, string> = {};
    if (paths.length) {
      try {
        urlMap = await this.storageService.createSignedDownloadUrls(
          paths,
          300,
          AVATARS_BUCKET,
        );
      } catch {
        // storage não configurado — retorna sem avatares
      }
    }
    return users.map((u) => this.toDto(u, urlMap));
  }

  async create(dto: CreateUserDto): Promise<UserWithAvatar> {
    const emailTaken = await this.userRepo.findOneBy({ email: dto.email });
    if (emailTaken) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }

    const role = await this.roleRepo.findOneBy({ id: dto.roleId });
    if (!role) {
      throw new BadRequestException('Papel inválido');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      isActive: dto.isActive ?? true,
      roleId: role.id,
    });
    const saved = await this.userRepo.save(user);
    const reloaded = await this.userRepo.findOneBy({ id: saved.id });
    return this.toDto(reloaded!, {});
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserWithAvatar> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (dto.roleId !== undefined) {
      const role = await this.roleRepo.findOneBy({ id: dto.roleId });
      if (!role) {
        throw new BadRequestException('Papel inválido');
      }
      user.roleId = dto.roleId;
      user.role = role;
    }
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }
    const saved = await this.userRepo.save(user);
    let avatarUrl: string | null = null;
    if (saved.avatarPath) {
      try {
        const result = await this.storageService.createSignedDownloadUrl(
          saved.avatarPath,
          300,
          AVATARS_BUCKET,
        );
        avatarUrl = result.signedUrl;
      } catch {
        // storage não configurado
      }
    }
    return this.toDto(saved, saved.avatarPath ? { [saved.avatarPath]: avatarUrl! } : {});
  }

  private toDto(user: User, urlMap: Record<string, string>): UserWithAvatar {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      avatarUrl: user.avatarPath ? (urlMap[user.avatarPath] ?? null) : null,
      role: {
        id: user.role?.id,
        name: user.role?.name ?? '',
        description: user.role?.description ?? null,
      },
    };
  }
}
