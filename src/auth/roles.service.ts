import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { FEATURE_LABELS } from './permissions.catalog';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
  ) {}

  findAll() {
    return this.roleRepo.find({ order: { name: 'ASC' } });
  }

  /** Permissões agrupadas por feature, para o seletor da UI. */
  async findGroupedPermissions() {
    const permissions = await this.permissionRepo.find();
    const byFeature = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = byFeature.get(p.feature) ?? [];
      list.push(p);
      byFeature.set(p.feature, list);
    }
    return [...byFeature.entries()].map(([feature, items]) => ({
      feature,
      label: FEATURE_LABELS[feature] ?? feature,
      permissions: items.map((p) => ({ key: p.key, label: p.label })),
    }));
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.roleRepo.findOneBy({ name: dto.name });
    if (existing) {
      throw new ConflictException('Já existe um papel com esse nome');
    }
    const permissions = await this.resolvePermissions(dto.permissionKeys);
    const role = this.roleRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      permissions,
    });
    return this.roleRepo.save(role);
  }

  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Papel não encontrado');
    }
    if (
      role.isSystem &&
      (dto.name !== undefined || dto.permissionKeys !== undefined)
    ) {
      throw new ForbiddenException('Papéis de sistema não podem ser alterados');
    }
    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissionKeys !== undefined) {
      role.permissions = await this.resolvePermissions(dto.permissionKeys);
    }
    return this.roleRepo.save(role);
  }

  async remove(id: number) {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: { users: true },
    });
    if (!role) {
      throw new NotFoundException('Papel não encontrado');
    }
    if (role.isSystem) {
      throw new ForbiddenException('Papéis de sistema não podem ser excluídos');
    }
    if (role.users && role.users.length > 0) {
      throw new BadRequestException(
        'Não é possível excluir um papel com usuários vinculados',
      );
    }
    await this.roleRepo.remove(role);
    return { success: true };
  }

  private async resolvePermissions(keys: string[]): Promise<Permission[]> {
    if (keys.length === 0) return [];
    const permissions = await this.permissionRepo.findBy({ key: In(keys) });
    if (permissions.length !== keys.length) {
      const found = new Set(permissions.map((p) => p.key));
      const invalid = keys.filter((k) => !found.has(k));
      throw new BadRequestException(
        `Permissões inválidas: ${invalid.join(', ')}`,
      );
    }
    return permissions;
  }
}
