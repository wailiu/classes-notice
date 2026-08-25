/**
 * 小程序全局配置
 *
 * baseUrl:后端 API 地址。
 *  - 微信开发者工具调试:保持 http://localhost:3000,并在「详情-本地设置」勾选
 *    「不校验合法域名、web-view(业务域名)、TLS 版本以及 HTTPS 证书」
 *  - 真机预览:改为局域网 IP(如 http://192.168.x.x:3000)
 *  - 生产:改为已备案的 https 域名,并在微信公众平台配置 request 合法域名
 *
 * devMock:开发模式开关。
 *  - true:登录页显示「模拟身份」入口,直接把 mock openid 当 code 发给后端
 *    (后端需 WX_MOCK=true,默认已开启)
 *  - false:走真实 wx.login() 获取 code,后端需配置 WX_APPID/WX_SECRET 且 WX_MOCK=false
 */
module.exports = {
  baseUrl: 'http://localhost:3000/api',
  devMock: true,
};
