# 独立 Usage 页面接入

页面地址：<https://zihangzou.github.io/usage.html>。主页不增加统计模块或导航入口，sitemap 不添加这个页面；usage 设置了 `noindex, nofollow`。独立地址及汇总数据仍然公开，`noindex` 不是访问密码。

## 1. 开通免费 Web Analytics

1. 注册或登录 <https://dash.cloudflare.com/>。
2. 找到 **Web Analytics**（如果导航显示 **Real User Monitoring**，进入对应的 Web Analytics 站点管理）。不要选择域名 DNS 接入向导。
3. 点击 **Add a site**，Hostname 填 `zihangzou.github.io`，然后 **Done**。
4. 打开 **Manage site**，复制 **JS snippet**，发给维护网站的助手。这段脚本中的 beacon token 是公开站点标识，可以放进网页；它不是下面的 API Token。
5. 助手将脚本加入主页和 7 个论文页面。不会在网页上显示统计模块，也不会跟踪 usage 页自身。

官方步骤：<https://developers.cloudflare.com/web-analytics/get-started/>

## 2. 让独立 Usage 页面读取统计

Cloudflare 自带后台可以直接查看数据。独立 usage 页面还需要一个只读 API Token，由 GitHub Actions 安全调用。

1. 在 Cloudflare 找到该站点所在账户的 **Account ID**（32 位字符）。不要填 Zone ID、Site ID 或 snippet 里的 beacon token。
2. 打开 **API Tokens → Create Token → Custom token**。
3. 名称可以用 `academic-usage-read`。权限只选 **Account → Account Analytics → Read**，账户范围只选这个网站所在的账户。不要授予 DNS、Workers 或账户管理写权限。
4. 创建后复制 Token，不要把 Token 发到聊天或粘到仓库文件。
5. 打开仓库的 [Actions secrets 设置](https://github.com/zihangzou/zihangzou.github.io/settings/secrets/actions)，点击 **New repository secret**，分别添加：

| Name | Secret |
| --- | --- |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `CF_API_TOKEN` | 刚创建的只读 API Token |

6. 打开 [Update usage statistics 工作流](https://github.com/zihangzou/zihangzou.github.io/actions/workflows/update-usage.yml)，点击 **Run workflow**，分支选 `main`。
7. 成功后等待 GitHub Pages 构建，再打开 `/usage.html`。以后按计划每 6 小时更新；GitHub 定时任务可能延迟，长期不活跃的公开仓库也可能停用计划任务。

官方 API Token 权限：<https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/>

## 数据含义

- 数据由浏览器统计脚本采集，不是服务器访问日志；不执行 JavaScript 的 AI 爬虫通常无法计入。
- **Page views** 是记录到的页面浏览。**Visits** 是 Cloudflare 定义的外部来源或直接进入次数，不是去重人数。
- 地理信息只展示国家／地区，不展示 IP、精确地址或访客身份。
- Today、7 days、30 days 都按 UTC 日界线计算，包含今天截至同步时刻的部分数据。
- 页面和来源榜单最多显示 20 条；总浏览量由单独的总量查询计算，不能用前 20 条相加替代。
- Neural Plagiarism 单独查询其论文页路径，不代表 PDF 下载量或 GitHub 点击数。
- Cloudflare 自适应采样可能产生估算数值。浏览器拦截脚本也会漏记。
- 不会补回接入前的访问记录；刚接通时可能暂时没有数据。

## 发布与失败处理

`usage-data.json` 仅包含 `zihangzou.github.io` 的汇总信息。脚本过滤该主机名并排除 `/usage.html`。API 凭据只存在 Actions Secrets 中，不出现在 HTML/JS/数据文件里。

如果某个 API 查询失败，脚本不覆盖上次成功的数据。usage 页显示最后更新时间，超过 24 小时会提示数据过期。页面 Refresh 按钮重新读取已发布快照，不会直接调用 Cloudflare API。

在获得真实凭据前，页面显示“Awaiting setup”，不是虚构的零访问。代码检查可使用 `python -m unittest discover -s tests -v`；凭据接入后的首次真实 API 调用与 Pages 构建仍需验证。
