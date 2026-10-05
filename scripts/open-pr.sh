#!/usr/bin/env bash
# 把 feat/campus-v2 推到 GitHub 并开 PR（先在终端运行 gh auth login）。
# 用法：scripts/open-pr.sh [远程仓库地址]
#   不给地址：用 gh 新建同名私有仓库 yunlan-mall-3d 并设为 origin
#   给了地址：把它设为 origin（仓库需已存在且为空，或 main 仍停在基线）
# 远程 main 推的是 v1 基线 2ca529c，PR 才能完整列出 v2、v3 的改动；本地已合并的 main 不推送。
set -euo pipefail
cd "$(dirname "$0")/.."

BASE=2ca529c6db53820bd26deb98fac294e5126910c4
BRANCH=feat/campus-v2

gh auth status >/dev/null
if ! git remote get-url origin >/dev/null 2>&1; then
  if [ $# -ge 1 ]; then
    git remote add origin "$1"
  else
    gh repo create yunlan-mall-3d --private --source . --remote origin
  fi
fi

git push origin "$BASE:refs/heads/main"
git push -u origin "$BRANCH"
gh pr create --base main --head "$BRANCH" \
  --title "云澜汇园区 v2 + v3：三期商业、云环天桥、中央公园、一期方庭与地铁云澜汇站" \
  --body-file docs/pr/campus-v2.md
