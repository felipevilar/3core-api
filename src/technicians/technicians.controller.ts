import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { TechniciansService } from './technicians.service';
import { RegisterTechDto } from './dto/register-tech.dto';
import { ListTechniciansQueryDto } from './dto/list-technicians.query.dto';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('leads')
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Public()
  @Post('tech')
  register(@Body() dto: RegisterTechDto) {
    return this.techniciansService.registerFromLanding(dto);
  }
}

/** Endpoints administrativos (dashboard) — exigem `tecnicos.ver`. */
@Controller('technicians')
export class TechniciansAdminController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Get()
  @RequirePermissions('tecnicos.ver')
  list(@Query() query: ListTechniciansQueryDto) {
    return this.techniciansService.list(query);
  }

  @Get(':id')
  @RequirePermissions('tecnicos.ver')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.techniciansService.findOne(id);
  }
}
