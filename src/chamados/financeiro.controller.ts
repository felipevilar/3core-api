import { Controller, Get, Query } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly service: FinanceiroService) {}

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
