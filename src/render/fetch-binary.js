const RETRY_DELAYS = [500, 1000];
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Retry the complete download, including interrupted response bodies. Parsing
 * and asset validation stay with the caller; corrupt models are not retried. */
export async function fetchBinary(url, { label = '模型', fetchImpl = globalThis.fetch, wait = sleep } = {}) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    let status;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        status = response.status;
        // Release an HTTP error response before opening another connection.
        await response.body?.cancel().catch(() => {});
        throw new Error(`HTTP ${status}`);
      }
      return await response.arrayBuffer();
    } catch (cause) {
      const canceled = cause?.name === 'AbortError';
      const retryable = !canceled && (status === undefined || TRANSIENT_HTTP.has(status));
      if (!retryable || attempt === RETRY_DELAYS.length) {
        const reason = status === undefined ? canceled ? '下载已取消' : '网络连接中断' : `HTTP ${status}`;
        const attempts = attempt ? `（已尝试 ${attempt + 1} 次）` : '';
        throw new Error(`${label}下载失败：${reason}${attempts}，请检查网络后刷新重试。`, { cause });
      }
      await wait(RETRY_DELAYS[attempt]);
    }
  }
}
