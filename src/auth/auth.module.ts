import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '8h') as `${number}h`,
        },
      }),
    }),
  ],
  controllers: [AuthController, RolesController, UsersController],
  providers: [
    AuthService,
    RolesService,
    UsersService,
    JwtStrategy,
    // Guards globais: por padrão tudo exige autenticação (fail-closed).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [TypeOrmModule, JwtModule],
})
export class AuthModule {}
