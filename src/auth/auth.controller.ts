import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  AvatarUploadUrlDto,
  ConfirmAvatarDto,
  UpdateProfileDto,
} from './dto/update-profile.dto';
import { Public } from './decorators/public.decorator';
import {
  CurrentUser,
  type AuthUser,
} from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }

  @Post('me/avatar/upload-url')
  createAvatarUploadUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: AvatarUploadUrlDto,
  ) {
    return this.authService.createAvatarUploadUrl(user.userId, dto);
  }

  @Patch('me/avatar')
  confirmAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmAvatarDto,
  ) {
    return this.authService.confirmAvatar(user.userId, dto);
  }
}
