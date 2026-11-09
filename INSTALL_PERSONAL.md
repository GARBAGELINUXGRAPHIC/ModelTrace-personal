# ModelTrace Guard Personal 安装与配置

本仓库是 [xqy2006/ModelTrace](https://github.com/xqy2006/ModelTrace) 的个人 fork。
个人改动位于 `personal-fork` 分支；插件版本为 `0.1.8`，市场名称为 `modeltrace-personal`。
保留上游作者、MIT 许可证、指纹库与评分器来源。

## 安装

需要 Node.js 18+ 和支持原生分页聊天 fork、临时分支及异步 hooks 的 Codex 运行时。
只安装插件时不需要运行仓库根目录的 Python Web 服务。

```sh
codex plugin marketplace add GARBAGELINUXGRAPHIC/ModelTrace-personal --ref personal-fork
codex plugin add modeltrace-guard@modeltrace-personal
```

如果已安装上游 `modeltrace-guard@modeltrace`，请在插件设置中停用原版，再启用个人版，避免两个版本对同一聊天同时执行 hooks。
安装后重新加载插件或打开新聊天。

在 Codex CLI 交互界面输入 `/hooks`，审阅并信任 `modeltrace-guard@modeltrace-personal` 的 hooks。
`/hooks` 不是系统终端命令。安装不会自动授予 hook 信任，插件变更后可能需要重新审阅。
详情参见 [OpenAI 插件安装文档](https://developers.openai.com/plugins/build/plugins) 和 [Hooks 信任说明](https://learn.chatgpt.com/docs/hooks)。

macOS 上如果 PATH 中的 CLI 比桌面应用旧，可用已安装的桌面内置 CLI 执行上述命令或打开交互界面。例如当前 ChatGPT 桌面应用的路径为：

```sh
/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
```

路径会随应用发行方式而不同；另一种常见位置为 `/Applications/Codex.app/Contents/Resources/codex`。
插件会优先查找这两个内置位置，再回退到 PATH；如果两者同时存在，需用 `MODELTRACE_CODEX_PATH` 明确选择实际使用的可执行文件。
自定义安装位置也可使用该环境变量，需确保启动后台 hooks 的进程能继承它。

## 为聊天启用监控

安装和信任 hooks 后，在目标聊天发送：

> 为当前聊天启用 ModelTrace Guard，使用 allowed-list 策略和默认 allowed_list。

监控按工作工具调用次数运行，默认间隔为 16–32 次。仅安装插件不会自动开启监控。
检测在原聊天的冻结快照所创建的临时 fork 中运行，会使用已配置的 Codex 账户与推理额度。

默认允许列表：

```json
{
  "allowed_list": [
    "gpt-6-astra",
    "gpt-6.1-sol",
    "gpt-6.2-astra",
    "gpt-6.2-bel",
    "gpt-6.2-sol"
  ]
}
```

该字段保存在当前聊天监控状态的 `config.allowed_list` 中。
判断为：指纹第一候选不在列表内，则立即告警并暂停原任务，不复测。
完整模型 ID 区分大小写，没有额外版本号或 Luna 特判，不使用 `eval()` 或 `Function()`。
名单只是准入策略，不会扩充指纹库；未收录模型仍可能被归为其他候选。指纹候选不能验证真实后端身份或推理强度。

要修改名单，可以直接在目标聊天请求：

> 把当前聊天的 ModelTrace allowed_list 改成 gpt-6-astra、gpt-6.1-sol。

手动命令示例，在源码中的 `codex-plugin/modeltrace-guard` 目录运行：

```sh
node scripts/guard.mjs configure --session <真实聊天ID> --allowed-list '["gpt-6-astra","gpt-6.1-sol"]'
```

`--allowed-list` 会切换到允许列表策略。名单改动会使旧的在途检测失效，并保留历史记录。
名单需要包含 1–100 个互不重复、不含空白的模型 ID；不要求这些 ID 已被指纹库收录。
新聊天需要单独启用；名单配置按聊天保存，不会因为共享工作目录而串到其他聊天。

## 诊断

在插件源码目录运行以下命令，并使用当前聊天真实 ID：

```sh
node scripts/guard.mjs doctor
node scripts/guard.mjs doctor --fork true --session <真实聊天ID>
node scripts/guard.mjs status --session <真实聊天ID>
```

`doctor --fork true` 创建临时快照与分支进行兼容性检查，不发起模型推理。
`forkAvailable: true` 只说明原生 fork 可用；`ready: false` 和 hook 错误表示尚不能开始采样。

- `metadata lacks model/provider/reasoning/workspace settings`：检查是否误用了与桌面应用不匹配的旧 CLI。
- `paginated_threads is not supported yet`：当前运行时不支持该聊天的分页存储；使用桌面应用配套运行时。
- hooks 为 `modified` 或尚未信任：打开 `/hooks` 审阅并信任当前插件定义，然后重新加载插件或新建聊天。
- 允许列表模式兼容旧摘要缺少模型/effort 的情况：固定受信任 hook 的模型与源摘要的 provider/cwd，记录原生 fork 的有效 effort；结果显式标记 `sourceEffortVerified: false`，不会将它说成已验证的原任务推理强度。

## 从源码安装、更新和验证

```sh
git clone --branch personal-fork https://github.com/GARBAGELINUXGRAPHIC/ModelTrace-personal.git
codex plugin marketplace add ./ModelTrace-personal
codex plugin add modeltrace-guard@modeltrace-personal
```

更新远程市场：

```sh
codex plugin marketplace upgrade modeltrace-personal
codex plugin add modeltrace-guard@modeltrace-personal
```

更新后检查插件版本并重新加载；hook 有改动时需重新审阅。
从源码运行测试：

```sh
cd ModelTrace-personal/codex-plugin/modeltrace-guard
npm test
```

测试使用本机临时端口和模拟协议，不发起真实模型检测。
本次修复已验证桌面内置运行时能创建当前聊天的原生快照与临时 fork；这与完成真实指纹采样是两项不同检查。
