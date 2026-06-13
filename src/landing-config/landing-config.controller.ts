import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { LandingConfigService } from './landing-config.service'

@Controller('landing-config')
export class LandingConfigController {
  constructor(private readonly service: LandingConfigService) {}

  @Get('groups/:type')
  findGroups(@Param('type') type: string) {
    return this.service.findGroups(type)
  }

  @Post('groups')
  createGroup(@Body() body: { type: string; name: string; order?: number }) {
    return this.service.createGroup(body)
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; order?: number; active?: boolean },
  ) {
    return this.service.updateGroup(id, body)
  }

  @Delete('groups/:id')
  removeGroup(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeGroup(id)
  }

  @Post('groups/:groupId/items')
  createItem(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body: { label: string; order?: number },
  ) {
    return this.service.createItem(groupId, body)
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { label?: string; order?: number; active?: boolean },
  ) {
    return this.service.updateItem(id, body)
  }

  @Delete('items/:id')
  removeItem(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeItem(id)
  }
}
