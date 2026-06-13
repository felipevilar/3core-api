import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { LandingConfigService } from './landing-config.service';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('landing-config')
export class LandingConfigController {
  constructor(private readonly service: LandingConfigService) {}

  // Público: consumido pela landing page (sem autenticação) no carregamento.
  @Public()
  @Get('groups/:type')
  findGroups(@Param('type') type: string) {
    return this.service.findGroups(type);
  }

  @Post('groups')
  @RequirePermissions('landing.gerenciar')
  createGroup(@Body() body: { type: string; name: string; order?: number }) {
    return this.service.createGroup(body);
  }

  @Patch('groups/:id')
  @RequirePermissions('landing.gerenciar')
  updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; order?: number; active?: boolean },
  ) {
    return this.service.updateGroup(id, body);
  }

  @Delete('groups/:id')
  @RequirePermissions('landing.gerenciar')
  removeGroup(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeGroup(id);
  }

  @Post('groups/:groupId/items')
  @RequirePermissions('landing.gerenciar')
  createItem(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: { label: string; order?: number },
  ) {
    return this.service.createItem(groupId, body);
  }

  @Patch('items/:id')
  @RequirePermissions('landing.gerenciar')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { label?: string; order?: number; active?: boolean },
  ) {
    return this.service.updateItem(id, body);
  }

  @Delete('items/:id')
  @RequirePermissions('landing.gerenciar')
  removeItem(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeItem(id);
  }
}
