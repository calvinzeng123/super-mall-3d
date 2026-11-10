#!/bin/bash
# Interleaved layout/nav timing for each stretch config, 3 rounds (fresh process per run).
WT=/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/wt-perf
cd "$(dirname "$0")"
declare -A CFG=( [base]="" [north]="NORTH_STACK=1" [west]="WEST_STACK=S61" [R]="R_STOREYS=53" [HA]="HA_STOREYS=56" [all]="WEST_STACK=S61 NORTH_STACK=1 HA_STOREYS=56 R_STOREYS=53" )
for round in 1 2 3; do for k in base north west R HA all; do
  line=$(env ${CFG[$k]} node --expose-gc navbreak.mjs $WT | head -1 | node -e "const s=require('fs').readFileSync(0,'utf8');const m=s.match(/\"layoutMs\":(\d+),\"navMs\":(\d+),\"layoutHeapMB\":([\d.]+),\"navHeapMB\":([\d.]+),\"rssMB\":(\d+)/);console.log(m.slice(1).join(' '))")
  echo "$round $k $line $(cut -d' ' -f1 /proc/loadavg)"
done; done
