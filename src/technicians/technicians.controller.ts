import { Body, Controller, Post } from '@nestjs/common';
import { TechniciansService } from './technicians.service';
import { RegisterTechDto } from './dto/register-tech.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('leads')
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Public()
  @Post('tech')
  register(@Body() dto: RegisterTechDto) {
    return this.techniciansService.registerFromLanding(dto);
  }
}
