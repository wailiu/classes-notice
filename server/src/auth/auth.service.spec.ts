import { AuthService } from './auth.service';

/**
 * 小程序登录身份识别单测(内存 mock):
 * openid 绑定在超管账号 → 校长(principal);未绑定 → none。
 */
describe('AuthService.miniLogin 校长身份识别', () => {
  const superAdmin = { id: 1, username: 'admin', name: '王校长', role: 'super', wxOpenid: 'mock-principal-1' };

  const makeService = (adminUser: any) =>
    new AuthService(
      {
        findOne: async ({ where }: any) =>
          adminUser && where.wxOpenid === adminUser.wxOpenid && where.role === adminUser.role
            ? adminUser
            : null,
      } as any,
      { findOne: async () => null } as any,
      { findOne: async () => null } as any,
      { sign: (p: any) => JSON.stringify(p) } as any,
      { codeToOpenid: async (code: string) => code } as any,
    );

  it('openid 绑定在超管账号:识别为校长(principal)', async () => {
    const res = await makeService(superAdmin).miniLogin('mock-principal-1');
    expect(res.role).toBe('principal');
    expect(res.profile).toEqual({ id: 1, name: '王校长', role: 'super' });
    const payload = JSON.parse(res.token);
    expect(payload).toEqual({ sub: 'mock-principal-1', role: 'principal', adminUserId: 1, scope: 'mini' });
  });

  it('openid 未绑定任何身份:role=none', async () => {
    const res = await makeService(null).miniLogin('stranger-openid');
    expect(res.role).toBe('none');
    expect(res.profile).toBeNull();
  });
});
