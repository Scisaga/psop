# PSOP 品牌图标

选定方向为「折叠空间」：朱红折带、空间转折与中央留白。原始选定展示图及 imagegen 提示词保存在 `concepts/`；正式图标以 `psop-mark.svg` 为矢量母版，按选定造型重绘。

- `psop-mark.svg`：透明背景的朱红折带，保留折叠明暗。
- `psop-mark-mono.svg`：使用 `currentColor` 的单色剪影。
- `icons/psop-icon-{size}.png`：透明 PNG，尺寸为 16、20、24、28、32、40、48、64、96、128、180、192、256、384、512、1024 像素。
- `psop-app-icon-{size}.png`：雾白底应用图标，尺寸为 180、192、512 像素。
- `favicon.svg`、`favicon.ico`：浏览器图标；ICO 内含 16、24、32、48、64、128、256 像素图像。

修改 SVG 母版后，在仓库根目录运行：

```powershell
node scripts/generate-brand-icons.mjs
```

导出使用工作台已有的 Playwright 和本机 Chrome。脚本同步网页需要的图标到 `apps/workbench/static/assets/brand/`，以及浏览器默认请求的根路径 favicon 与 Apple 图标。品牌展示图和提示词仅保存在本目录，不打包进工作台。
