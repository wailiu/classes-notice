import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { AdminGuard, AdminJwtPayload, CurrentUser } from './guards';

class AdminLoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}

class MiniLoginDto {
  @IsString()
  @IsNotEmpty({ message: '缺少登录 code' })
  code: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto.username, dto.password);
  }

  @UseGuards(AdminGuard)
  @Get('profile')
  profile(@CurrentUser() user: AdminJwtPayload) {
    return this.auth.adminProfile(user.sub);
  }

  @Post('mini-login')
  miniLogin(@Body() dto: MiniLoginDto) {
    return this.auth.miniLogin(dto.code);
  }
}
