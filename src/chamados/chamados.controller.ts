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
  AjustarExecucaoDto,
  AtribuirDto,
  ComentarioDto,
  ComprovanteUploadUrlDto,
  CreateComprovanteDto,
  CreateLineItemDto,
  CreateRatDto,
  CreateVisitaDto,
  FinalizarDto,
  MinhaRotaQueryDto,
  MotivoDto,
  OrdemRotaDto,
  PausarDto,
  RatUploadUrlDto,
  ReagendarDto,
  TransicaoCampoDto,
  UpdateLineItemDto,
  UpdateImpostoDto,
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

  // Rota do dia do técnico (gestor pode consultar outro técnico).
  @Get('minha-rota')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  minhaRota(@Query() query: MinhaRotaQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.minhaRota(query, user);
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

  // ---- visitas ----
  @Get(':id/visitas')
  @RequirePermissions('atendimentos.ver')
  visitas(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listVisitas(id, user);
  }

  /** Nova visita (retorno) após a atual ter sido finalizada/cancelada. */
  @Post(':id/visitas')
  @RequirePermissions('atendimentos.gerenciar')
  criarVisita(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateVisitaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.criarVisita(id, dto, user);
  }

  @Post(':id/visitas/:visitaId/cancelar')
  @RequirePermissions('atendimentos.gerenciar')
  cancelarVisita(
    @Param('id', ParseIntPipe) id: number,
    @Param('visitaId', ParseIntPipe) visitaId: number,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancelarVisita(id, visitaId, dto, user);
  }

  /** Gestor corrige horas/km de uma visita finalizada (regenera linhas auto). */
  @Patch(':id/visitas/:visitaId/execucao')
  @RequirePermissions('financeiro.gerenciar')
  ajustarExecucao(
    @Param('id', ParseIntPipe) id: number,
    @Param('visitaId', ParseIntPipe) visitaId: number,
    @Body() dto: AjustarExecucaoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.ajustarExecucao(id, visitaId, dto, user);
  }

  @Patch(':id/visitas/:visitaId/ordem')
  @RequireAnyPermission('atendimentos.ver_solicitacoes', 'agenda.gerenciar')
  ordemRota(
    @Param('id', ParseIntPipe) id: number,
    @Param('visitaId', ParseIntPipe) visitaId: number,
    @Body() dto: OrdemRotaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.definirOrdemRota(
      id,
      visitaId,
      dto.ordemRota ?? null,
      user,
    );
  }

  @Get(':id/visitas/:visitaId/assinatura/download-url')
  @RequirePermissions('atendimentos.ver')
  assinaturaDownloadUrl(
    @Param('id', ParseIntPipe) id: number,
    @Param('visitaId', ParseIntPipe) visitaId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getAssinaturaDownloadUrl(id, visitaId, user);
  }

  /** Prévia da finalização: horas líquidas sugeridas e pausas da visita atual. */
  @Get(':id/previa-finalizacao')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  previaFinalizacao(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.previaFinalizacao(id, user);
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

  // ---- aceite de solicitação (técnico dono ou gestor em nome dele) ----
  @Post(':id/aceitar')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  aceitar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.aceitar(id, user);
  }

  @Post(':id/recusar')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  recusar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recusar(id, dto, user);
  }

  // ---- transições do técnico (dono ou gestor em nome dele) ----
  @Post(':id/a-caminho')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  aCaminho(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransicaoCampoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.marcarACaminho(id, dto, user);
  }

  @Post(':id/chegada')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  chegada(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransicaoCampoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.confirmarChegada(id, dto, user);
  }

  @Post(':id/pausar')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  pausar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PausarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.pausar(id, dto, user);
  }

  @Post(':id/retomar')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  retomar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.retomar(id, user);
  }

  @Post(':id/finalizar')
  @RequireAnyPermission(
    'atendimentos.ver_solicitacoes',
    'atendimentos.gerenciar',
  )
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.finalizar(id, dto, user);
  }

  // ---- arquivamento ----
  @Post(':id/arquivar')
  @RequirePermissions('atendimentos.gerenciar')
  arquivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.arquivar(id, user);
  }

  @Post(':id/desarquivar')
  @RequirePermissions('atendimentos.gerenciar')
  desarquivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.desarquivar(id, user);
  }

  // ---- comentários (técnico dono ou gestor; escopo no service) ----
  @Get(':id/comentarios')
  @RequirePermissions('atendimentos.ver')
  comentarios(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listComentarios(id, user);
  }

  @Post(':id/comentarios')
  @RequirePermissions('atendimentos.ver')
  addComentario(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComentarioDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComentario(id, dto, user);
  }

  @Delete(':id/comentarios/:comentarioId')
  @RequirePermissions('atendimentos.ver')
  removeComentario(
    @Param('id', ParseIntPipe) id: number,
    @Param('comentarioId', ParseIntPipe) comentarioId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeComentario(id, comentarioId, user);
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

  /** Signed upload URL para a imagem da assinatura do cliente. */
  @Post(':id/assinatura/upload-url')
  @RequireAnyPermission('atendimentos.ver_solicitacoes', 'atendimentos.editar')
  assinaturaUploadUrl(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createAssinaturaUploadUrl(id, user);
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

  // ---- comprovantes do repasse ao técnico ----
  // Mesmo fluxo da RAT: upload-url → PUT no Storage → confirma metadados.
  // Anexar/remover: financeiro.gerenciar. Ver/baixar: financeiro (todos) ou o
  // próprio técnico (ver_proprio), com escopo validado no service.
  @Get(':id/comprovantes')
  @RequireAnyPermission('financeiro.ver', 'financeiro.ver_proprio')
  comprovantes(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.listComprovantes(id, user);
  }

  @Post(':id/comprovantes/upload-url')
  @RequirePermissions('financeiro.gerenciar')
  comprovanteUploadUrl(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComprovanteUploadUrlDto,
  ) {
    return this.service.createComprovanteUploadUrl(id, dto.fileName);
  }

  @Post(':id/comprovantes')
  @RequirePermissions('financeiro.gerenciar')
  addComprovante(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateComprovanteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addComprovante(id, dto, user);
  }

  @Get(':id/comprovantes/:comprovanteId/download-url')
  @RequireAnyPermission('financeiro.ver', 'financeiro.ver_proprio')
  comprovanteDownloadUrl(
    @Param('id', ParseIntPipe) id: number,
    @Param('comprovanteId', ParseIntPipe) comprovanteId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getComprovanteDownloadUrl(id, comprovanteId, user);
  }

  @Delete(':id/comprovantes/:comprovanteId')
  @RequirePermissions('financeiro.gerenciar')
  removeComprovante(
    @Param('id', ParseIntPipe) id: number,
    @Param('comprovanteId', ParseIntPipe) comprovanteId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeComprovante(id, comprovanteId, user);
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

  @Patch(':id/imposto')
  @RequirePermissions('financeiro.gerenciar')
  updateImposto(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImpostoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateImposto(id, dto, user);
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
