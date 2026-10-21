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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsQueryDto } from './dto/list-clients.query.dto';
import {
  CreateClientLocalDto,
  UpdateClientLocalDto,
} from './dto/client-local.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequirePermissions('clientes.ver')
  list(@Query() query: ListClientsQueryDto) {
    return this.clientsService.list(query);
  }

  @Get(':id')
  @RequirePermissions('clientes.ver')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.findOne(id);
  }

  @Post()
  @RequirePermissions('clientes.criar')
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('clientes.editar')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('clientes.excluir')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.remove(id);
  }

  // ---- Locais (sites) do cliente ----
  @Get(':id/locais')
  @RequirePermissions('clientes.ver')
  listLocais(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.listLocais(id);
  }

  @Post(':id/locais')
  @RequirePermissions('clientes.editar')
  createLocal(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateClientLocalDto,
  ) {
    return this.clientsService.createLocal(id, dto);
  }

  @Patch(':id/locais/:localId')
  @RequirePermissions('clientes.editar')
  updateLocal(
    @Param('id', ParseIntPipe) id: number,
    @Param('localId', ParseIntPipe) localId: number,
    @Body() dto: UpdateClientLocalDto,
  ) {
    return this.clientsService.updateLocal(id, localId, dto);
  }

  @Delete(':id/locais/:localId')
  @RequirePermissions('clientes.editar')
  removeLocal(
    @Param('id', ParseIntPipe) id: number,
    @Param('localId', ParseIntPipe) localId: number,
  ) {
    return this.clientsService.removeLocal(id, localId);
  }
}
