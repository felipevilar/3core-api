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

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  findAll() {
    // passwordHash já é select:false; role vem via eager.
    return this.userRepo.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateUserDto) {
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
    // Recarrega sem o passwordHash (select:false) e com a role eager.
    return this.userRepo.findOneBy({ id: saved.id });
  }

  async update(id: number, dto: UpdateUserDto) {
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
    return this.userRepo.save(user);
  }
}
