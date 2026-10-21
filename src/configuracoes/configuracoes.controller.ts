import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfiguracoesService } from './configuracoes.service';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import {
  CreateSlaPoliticaDto,
  UpdateSlaPoliticaDto,
} from './dto/sla-politica.dto';
import { CreateMotivoDto, UpdateMotivoDto } from './dto/motivo.dto';
import type { MotivoTipo } from './entities/motivo.entity';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('configuracoes')
export class ConfiguracoesController {
  constructor(private readonly service: ConfiguracoesService) {}

  // ---- flags operacionais ----
  @Get()
  @RequirePermissions('configuracoes.ver')
  get() {
    return this.service.get();
  }

  @Patch()
  @RequirePermissions('configuracoes.gerenciar')
  update(@Body() dto: UpdateAppConfigDto, @CurrentUser() user: AuthUser) {
    return this.service.update(dto, user);
  }

  // ---- SLA ----
  @Get('sla')
  @RequirePermissions('configuracoes.ver')
  listSla() {
    return this.service.listSla();
  }

  @Post('sla')
  @RequirePermissions('configuracoes.gerenciar')
  createSla(@Body() dto: CreateSlaPoliticaDto) {
    return this.service.createSla(dto);
  }

  @Patch('sla/:id')
  @RequirePermissions('configuracoes.gerenciar')
  updateSla(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSlaPoliticaDto,
  ) {
    return this.service.updateSla(id, dto);
  }

  @Delete('sla/:id')
  @RequirePermissions('configuracoes.gerenciar')
  removeSla(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSla(id);
  }

  // ---- motivos (leitura liberada a quem usa os modais de motivo) ----
  @Get('motivos')
  @RequirePermissions('atendimentos.ver')
  listMotivos(
    @Query('tipo') tipo?: MotivoTipo,
    @Query('incluirInativos') incluirInativos?: string,
  ) {
    return this.service.listMotivos(tipo, incluirInativos === 'true');
  }

  @Post('motivos')
  @RequirePermissions('configuracoes.gerenciar')
  createMotivo(@Body() dto: CreateMotivoDto) {
    return this.service.createMotivo(dto);
  }

  @Patch('motivos/:id')
  @RequirePermissions('configuracoes.gerenciar')
  updateMotivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMotivoDto,
  ) {
    return this.service.updateMotivo(id, dto);
  }

  @Delete('motivos/:id')
  @RequirePermissions('configuracoes.gerenciar')
  removeMotivo(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeMotivo(id);
  }
}
