import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificacoesService } from './notificacoes.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

/** Notificações do próprio usuário autenticado (sem permissão extra). */
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('naoLidas') naoLidas?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(
      user.userId,
      naoLidas === 'true',
      limit ? Number(limit) || 50 : 50,
    );
  }

  @Get('count')
  count(@CurrentUser() user: AuthUser) {
    return this.service.countNaoLidas(user.userId);
  }

  @Patch('lidas')
  marcarTodas(@CurrentUser() user: AuthUser) {
    return this.service.marcarTodasLidas(user.userId);
  }

  @Patch(':id/lida')
  marcarLida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.marcarLida(user.userId, id);
  }
}
