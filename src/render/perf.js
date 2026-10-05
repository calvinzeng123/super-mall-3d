// 帧率监测（纯逻辑，可在 Node 中测试）：加载后 grace 毫秒起，按 window 毫秒为一个窗口统计帧率，
// 扣除窗口内最长的一次卡顿（首次编译着色器等一次性停顿），低于 minFps 视为持续低帧率 → 返回 true（应降级）。
// 页面隐藏、或两帧间隔超过 stall 毫秒（后台节流）时重新计时；极慢设备每帧都 >250ms 也照样计入。
export function createPerfMonitor(start, { grace = 6000, window = 5000, minFps = 22, stall = 3000 } = {}) {
  let t0 = null;
  let frames = 0;
  let maxGap = 0;
  let last = null;
  const mon = {
    fps: null,
    tick(now, hidden) {
      const gap = last === null ? 0 : now - last;
      last = now;
      if (hidden || now - start < grace || gap > stall || t0 === null) {
        t0 = now;
        frames = 0;
        maxGap = 0;
        return false;
      }
      frames++;
      maxGap = Math.max(maxGap, gap);
      if (now - t0 < window) return false;
      mon.fps = ((frames - 1) * 1000) / Math.max(1, now - t0 - maxGap);
      t0 = now;
      frames = 0;
      maxGap = 0;
      return mon.fps < minFps;
    },
  };
  return mon;
}
