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
import { ServicosService } from './servicos.service';
import { CreateServicoDto, UpdateServicoDto } from './dto/servico.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('servicos')
export class ServicosController {
  constructor(private readonly service: ServicosService) {}

  @Get()
  @RequirePermissions('servicos.ver')
  list(@Query('incluirInativos') incluirInativos?: string) {
    return this.service.list(incluirInativos === 'true');
  }

  @Get(':id')
  @RequirePermissions('servicos.ver')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('servicos.gerenciar')
  create(@Body() dto: CreateServicoDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('servicos.gerenciar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateServicoDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('servicos.gerenciar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
