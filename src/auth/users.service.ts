import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UpdateUserDto } from './dto/update-user.dto';

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
