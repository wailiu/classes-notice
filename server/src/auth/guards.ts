import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export interface AdminJwtPayload {
  sub: number;
  username: string;
  role: 'super' | 'staff';
  scope: 'admin';
}

export interface MiniJwtPayload {
  sub: string; // openid
  role: 'parent' | 'teacher' | 'principal' | 'none';
  parentId?: number;
  teacherId?: number;
  adminUserId?: number;
  scope: 'mini';
}

function extractToken(ctx: ExecutionContext): string {
  const req = ctx.switchToHttp().getRequest();
  const header: string = req.headers['authorization'] || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) throw new UnauthorizedException('未登录或登录已过期');
  return token;
}

/** 后台管理端守卫,可配合 @Roles('super') 限制超管 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const token = extractToken(ctx);
    let payload: AdminJwtPayload;
    try {
      payload = this.jwt.verify<AdminJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    if (payload.scope !== 'admin') throw new UnauthorizedException('无后台访问权限');
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.includes(payload.role)) {
      throw new ForbiddenException('权限不足');
    }
    ctx.switchToHttp().getRequest().user = payload;
    return true;
  }
}

/** 小程序端守卫(家长/老师) */
@Injectable()
export class MiniGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const token = extractToken(ctx);
    let payload: MiniJwtPayload;
    try {
      payload = this.jwt.verify<MiniJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('未登录或登录已过期');
    }
    if (payload.scope !== 'mini') throw new UnauthorizedException('无小程序访问权限');
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles?.length && !roles.includes(payload.role)) {
      throw new ForbiddenException('当前身份无权访问');
    }
    ctx.switchToHttp().getRequest().user = payload;
    return true;
  }
}

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
