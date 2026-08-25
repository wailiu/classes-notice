import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 微信登录服务。
 *
 * - 开发模式(WX_MOCK=true,默认):不调用微信服务器,直接把 code 当作 openid 使用。
 *   小程序端配合 mock 登录页传入 "mock-parent-1" / "mock-teacher-1" 等假 code 即可联调。
 * - 生产模式(WX_MOCK=false):使用真实 AppId/Secret 调用 jscode2session 换取 openid。
 *   需在 .env 配置 WX_APPID、WX_SECRET,并在小程序端使用 wx.login() 获取真实 code。
 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  constructor(private readonly config: ConfigService) {}

  get mockEnabled(): boolean {
    return this.config.get('WX_MOCK', 'true') === 'true';
  }

  async codeToOpenid(code: string): Promise<string> {
    if (!code) throw new BadRequestException('缺少登录 code');
    if (this.mockEnabled) {
      this.logger.debug(`WX_MOCK 已开启,直接把 code 当作 openid: ${code}`);
      return code;
    }
    const appid = this.config.get<string>('WX_APPID');
    const secret = this.config.get<string>('WX_SECRET');
    if (!appid || !secret) {
      throw new BadRequestException('服务端未配置 WX_APPID/WX_SECRET,无法使用真实微信登录');
    }
    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}` +
      `&secret=${secret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const res = await fetch(url);
    const data = (await res.json()) as { openid?: string; errcode?: number; errmsg?: string };
    if (!data.openid) {
      this.logger.warn(`jscode2session 失败: ${data.errcode} ${data.errmsg}`);
      throw new BadRequestException(`微信登录失败: ${data.errmsg || '未知错误'}`);
    }
    return data.openid;
  }
}
