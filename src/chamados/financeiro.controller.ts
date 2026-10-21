import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  PagamentoLoteDto,
  UpdateFinanceiroConfigDto,
} from './dto/chamado-actions.dto';

@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly service: FinanceiroService) {}

  /** Configuração financeira (alíquota de imposto vigente). */
  @Get('config')
  @RequirePermissions('financeiro.ver')
  getConfig() {
    return this.service.getConfig();
  }

  /** Troca a alíquota vigente e recalcula os chamados não fechados. */
  @Patch('config')
  @RequirePermissions('financeiro.gerenciar')
  updateConfig(
    @Body() dto: UpdateFinanceiroConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateConfig(dto.aliquotaImposto, user);
  }

  /** Aprovação/pagamento em massa de repasses (tolerante a falhas por id). */
  @Patch('pagamentos/lote')
  @RequirePermissions('financeiro.gerenciar')
  pagamentoLote(@Body() dto: PagamentoLoteDto, @CurrentUser() user: AuthUser) {
    return this.service.pagamentoLote(dto, user);
  }

  /** Painel consolidado de um período (KPIs + atendimentos). */
  @Get('overview')
  @RequirePermissions('financeiro.ver')
  overview(@Query('de') de?: string, @Query('ate') ate?: string) {
    return this.service.overview({ de, ate });
  }

  /** Folha de todos os técnicos (admin/financeiro). */
  @Get('payout')
  @RequirePermissions('financeiro.ver')
  payout(
    @Query('periodo') periodo?: string,
    @Query('tecnicoUserId') tecnicoUserId?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.service.payout({
      periodo,
      tecnicoUserId: tecnicoUserId ? Number(tecnicoUserId) : undefined,
      paymentStatus,
    });
  }

  /** Ganhos do próprio técnico (sempre escopado ao requisitante). */
  @Get('meus-ganhos')
  @RequirePermissions('financeiro.ver_proprio')
  meusGanhos(
    @CurrentUser() user: AuthUser,
    @Query('periodo') periodo?: string,
  ) {
    return this.service.meusGanhos(user, periodo);
  }
}
