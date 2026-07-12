import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('cities')
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  // Público: consumido pela landing (autocomplete de cidades no cadastro).
  @Public()
  @Get('search')
  search(@Query('q') q: string, @Query('uf') uf?: string) {
    return this.citiesService.search(q ?? '', uf);
  }

  @Public()
  @Get('ufs')
  listUfs() {
    return this.citiesService.listUfs();
  }

  @Get(':code')
  findOne(@Param('code', ParseIntPipe) code: number) {
    return this.citiesService.findByCode(code);
  }
}
