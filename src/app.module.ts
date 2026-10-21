import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LandingConfigModule } from './landing-config/landing-config.module';
import { AuthModule } from './auth/auth.module';
import { TechniciansModule } from './technicians/technicians.module';
import { ClientsModule } from './clients/clients.module';
import { CitiesModule } from './cities/cities.module';
import { ChamadosModule } from './chamados/chamados.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { ServicosModule } from './servicos/servicos.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        // DATABASE_SSL=false para Postgres local sem TLS (dev/testes).
        ssl:
          configService.get<string>('DATABASE_SSL') === 'false'
            ? false
            : { rejectUnauthorized: false },
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    NotificacoesModule,
    NotificationsModule,
    StorageModule,
    ConfiguracoesModule,
    ServicosModule,
    CitiesModule,
    TechniciansModule,
    ClientsModule,
    ChamadosModule,
    LandingConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
