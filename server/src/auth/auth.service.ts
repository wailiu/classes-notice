import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AdminUser, Parent, Teacher } from '../entities';
import { WechatService } from './wechat.service';
import { AdminJwtPayload, MiniJwtPayload } from './guards';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser) private readonly adminRepo: Repository<AdminUser>,
    @InjectRepository(Parent) private readonly parentRepo: Repository<Parent>,
    @InjectRepository(Teacher) private readonly teacherRepo: Repository<Teacher>,
    private readonly jwt: JwtService,
    private readonly wechat: WechatService,
  ) {}

  /** 后台账号密码登录 */
  async adminLogin(username: string, password: string) {
    const user = await this.adminRepo.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload: AdminJwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      scope: 'admin',
    };
    return {
      token: this.jwt.sign(payload),
      profile: { id: user.id, username: user.username, name: user.name, role: user.role },
    };
  }

  async adminProfile(id: number) {
    const user = await this.adminRepo.findOne({ where: { id } });
    if (!user) throw new UnauthorizedException('账号不存在');
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  }

  /**
   * 小程序登录:code -> openid -> 按 openid 识别家长/老师身份。
   * 未绑定的 openid 也会发放 token(role=none),前端引导联系前台绑定。
   */
  async miniLogin(code: string) {
    const openid = await this.wechat.codeToOpenid(code);
    const [parent, teacher, principal] = await Promise.all([
      this.parentRepo.findOne({ where: { wxOpenid: openid } }),
      this.teacherRepo.findOne({ where: { wxOpenid: openid } }),
      // 校长:绑定 openid 的超管账号(前台教务不开放小程序端)
      this.adminRepo.findOne({ where: { wxOpenid: openid, role: 'super' } }),
    ]);

    let payload: MiniJwtPayload;
    let profile: Record<string, unknown> | null = null;
    if (parent) {
      payload = { sub: openid, role: 'parent', parentId: parent.id, scope: 'mini' };
      profile = { id: parent.id, name: parent.name, phone: parent.phone };
    } else if (teacher) {
      payload = { sub: openid, role: 'teacher', teacherId: teacher.id, scope: 'mini' };
      profile = { id: teacher.id, name: teacher.name, phone: teacher.phone, subjects: teacher.subjects };
    } else if (principal) {
      payload = { sub: openid, role: 'principal', adminUserId: principal.id, scope: 'mini' };
      profile = { id: principal.id, name: principal.name, role: principal.role };
    } else {
      payload = { sub: openid, role: 'none', scope: 'mini' };
    }
    return { token: this.jwt.sign(payload), role: payload.role, profile, openid };
  }
}
