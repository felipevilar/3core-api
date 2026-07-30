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
  RatUploadUrlDto,
  ReagendarDto,
  UpdateLineItemDto,
  UpdatePagamentoDto,
} from './dto/chamado-actions.dto';
import { AgendaQueryDto } from './dto/agenda.query.dto';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/decorators/require-permissions.decorator';
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

  // Rota literal deve vir ANTES de @Get(':id') para não ser capturada como id.
  @Get('agenda')
  @RequirePermissions('agenda.ver')
  agenda(@Query() query: AgendaQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.agenda(query, user);
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
  @RequirePermissions('atendimentos.ver_historico')
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

  @Patch(':id/reagendar')
  @RequirePermissions('agenda.gerenciar')
  reagendar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReagendarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reagendar(id, dto.agendadoPara ?? null, user);
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

  @Post(':id/desatribuir')
  @RequirePermissions('atendimentos.gerenciar')
  desatribuir(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.desatribuir(id, user);
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

  // ---- aceite de solicitação (técnico dono) ----
  @Post(':id/aceitar')
  @RequirePermissions('atendimentos.ver_solicitacoes')
  aceitar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.aceitar(id, user);
  }

  @Post(':id/recusar')
  @RequirePermissions('atendimentos.ver_solicitacoes')
  recusar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recusar(id, dto, user);
  }

  // ---- transições do técnico (dono) ----
  @Post(':id/a-caminho')
  @RequirePermissions('atendimentos.ver_solicitacoes')
  aCaminho(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.marcarACaminho(id, user);
  }

  @Post(':id/chegada')
  @RequirePermissions('atendimentos.ver_solicitacoes')
  chegada(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirmarChegada(id, user);
  }

  @Post(':id/finalizar')
  @RequirePermissions('atendimentos.ver_solicitacoes')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.finalizar(id, dto, user);
  }

  // ---- RAT ----
  // 1) pede a URL assinada de upload; 2) sobe o arquivo direto ao Storage;
  // 3) confirma os metadados via POST :id/rat.
  // Anexar/remover: técnico dono (ver_solicitacoes) OU gestor (editar) — o
  // service confere o vínculo dono/gestor; aqui só barramos quem não tem nenhuma.
  @Post(':id/rat/upload-url')
  @RequireAnyPermission('atendimentos.ver_solicitacoes', 'atendimentos.editar')
  ratUploadUrl(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RatUploadUrlDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createRatUploadUrl(id, dto.fileName, user);
  }

  @Post(':id/rat')
  @RequireAnyPermission('atendimentos.ver_solicitacoes', 'atendimentos.editar')
  addRat(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRatDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addRat(id, dto, user);
  }

  @Get(':id/rat/:ratId/download-url')
  @RequirePermissions('atendimentos.ver')
  ratDownloadUrl(
    @Param('id', ParseIntPipe) id: number,
    @Param('ratId', ParseIntPipe) ratId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getRatDownloadUrl(id, ratId, user);
  }

  @Delete(':id/rat/:ratId')
  @RequireAnyPermission('atendimentos.ver_solicitacoes', 'atendimentos.editar')
  removeRat(
    @Param('id', ParseIntPipe) id: number,
    @Param('ratId', ParseIntPipe) ratId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeRat(id, ratId, user);
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
