import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser, Parent, Teacher } from '../entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WechatService } from './wechat.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminUser, Parent, Teacher])],
  controllers: [AuthController],
  providers: [AuthService, WechatService],
  exports: [AuthService, WechatService],
})
export class AuthModule {}
