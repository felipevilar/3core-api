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
import { ChamadosService } from './chamados.service';
import { CreateChamadoDto } from './dto/create-chamado.dto';
import { UpdateChamadoDto } from './dto/update-chamado.dto';
import { ListChamadosQueryDto } from './dto/list-chamados.query.dto';
import {
  AtribuirDto,
  CreateLineItemDto,
  CreateRatDto,
  FinalizarDto,
  MotivoDto,
  UpdateLineItemDto,
  UpdatePagamentoDto,
} from './dto/chamado-actions.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('chamados')
export class ChamadosController {
  constructor(private readonly service: ChamadosService) {}

  // ---- leitura ----
  @Get()
  @RequirePermissions('atendimentos.ver')
  list(@Query() query: ListChamadosQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  @RequirePermissions('atendimentos.ver')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Get(':id/eventos')
  @RequirePermissions('atendimentos.ver')
  eventos(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listEventos(id, user);
  }

  @Get(':id/rats')
  @RequirePermissions('atendimentos.ver')
  rats(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.listRats(id, user);
  }

  // ---- CRUD ----
  @Post()
  @RequirePermissions('atendimentos.criar')
  create(@Body() dto: CreateChamadoDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  @RequirePermissions('atendimentos.editar')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChamadoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('atendimentos.excluir')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // ---- transições administrativas ----
  @Post(':id/atribuir')
  @RequirePermissions('atendimentos.gerenciar')
  atribuir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtribuirDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.atribuir(id, dto, user);
  }

  @Post(':id/fechar')
  @RequirePermissions('atendimentos.gerenciar')
  fechar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.fechar(id, user);
  }

  @Post(':id/reabrir')
  @RequirePermissions('atendimentos.gerenciar')
  reabrir(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reabrir(id, dto, user);
  }

  @Post(':id/cancelar')
  @RequirePermissions('atendimentos.gerenciar')
  cancelar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelar(id, dto, user);
  }

  // ---- transições do técnico (dono) ----
  @Post(':id/a-caminho')
  @RequirePermissions('atendimentos.editar')
  aCaminho(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.marcarACaminho(id, user);
  }

  @Post(':id/chegada')
  @RequirePermissions('atendimentos.editar')
  chegada(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirmarChegada(id, user);
  }

  @Post(':id/finalizar')
  @RequirePermissions('atendimentos.editar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.finalizar(id, dto, user);
  }

  // ---- RAT ----
  @Post(':id/rat')
  @RequirePermissions('atendimentos.editar')
  addRat(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addRat(id, dto, user);
  }

  // ---- financeiro por chamado ----
  @Post(':id/line-items')
  @RequirePermissions('financeiro.gerenciar')
  addLineItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateLineItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addLineItem(id, dto, user);
  }

  @Patch(':id/line-items/:itemId')
  @RequirePermissions('financeiro.gerenciar')
  updateLineItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateLineItemDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateLineItem(id, itemId, dto, user);
  }

  @Delete(':id/line-items/:itemId')
  @RequirePermissions('financeiro.gerenciar')
  removeLineItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeLineItem(id, itemId, user);
  }

  @Patch(':id/pagamento')
  @RequirePermissions('financeiro.gerenciar')
  updatePagamento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePagamentoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updatePagamento(id, dto, user);
  }
}
