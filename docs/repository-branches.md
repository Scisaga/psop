# 仓库主分支与归档

2026-11-07（Asia/Shanghai）。GitLab `servforce.ai/psop` 与 GitHub `Scisaga/psop` 统一使用 `main` 作为默认开发分支；两端 `main` 使用同一个提交和文件树。

切换前，两端 `v2` 文件树均为 `0c41f4906e2be3ee9014a8f35dd0de05593fdd7c`。GitLab 的旧历史含超过 GitHub 普通 Git 文件大小限制的历史大文件，因此共享主线从 GitHub 中内容完全相同的 `v2` 提交 `089b86b50b0672fb6661cbb42ba0914e89758184` 继续。GitLab 的完整旧历史以独立归档分支保留，不重写或合并进新的共享主线。

| 位置 | 归档分支 | 切换前提交 |
| --- | --- | --- |
| GitLab 原默认分支 `master` | `archive/master-2026-11-07` | `dad11e090230b70a851e3350c3816aae67b571ec` |
| GitLab 原 `v2` | `archive/v2-2026-11-07` | `a8846ea1e2060e8b235f435ac9da549c930c3ba8` |
| GitHub 原 `v2` | `archive/v2-2026-11-07` | `089b86b50b0672fb6661cbb42ba0914e89758184` |

后续在 `main` 开发，将同一提交推送到两端；不再为同一批修改分别生成两套主分支提交。归档分支用于历史追溯，继续保留旧输入、合同和验证记录的实际版本范围。

本机工作区的 `origin` 拉取 GitLab，推送地址包含 GitLab 与 GitHub；在 `main` 执行 `git push origin main` 会推送到两端。其他克隆可分别配置两个远端，再显式同步推送：

```powershell
git push origin main
git push github main
```
