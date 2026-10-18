// 多執行緒 ffmpeg 引擎。API 跟 @ffmpeg/ffmpeg 的 FFmpeg 類別對齊，
// 所以主程式可以在單／多執行緒之間直接對調。
//
// ⚠ 為什麼跑在主執行緒：core-mt 在 worker 裡初始化會卡死（emscripten 的 pthread
//   沒辦法從巢狀 worker 起來，實測 createFFmpegCore 永遠不回來、也不報錯）。
//   放在主執行緒 862 ms 就起來了，所以只能這樣。
//
// ⚠ 代價：exec 是同步的，跑的時候整個畫面會凍住。純 CSS 動畫由瀏覽器另一條
//   執行緒負責，凍結時仍會動（實測過），所以 UI 要靠動畫讓人知道還活著。
//   工作太長就不要用這個引擎，交給單執行緒版（有真實進度條）。

export class FFmpegMT {
  #core = null;
  #handlers = { log: [], progress: [] };

  on(ev, fn) { if (this.#handlers[ev]) this.#handlers[ev].push(fn); }

  async load({ coreURL, wasmURL, workerURL }) {
    const mod = await import(/* @vite-ignore */ coreURL);
    // wasmURL / workerURL 要塞在 hash 裡，core 內部的 locateFile 靠這個找檔案
    this.#core = await mod.default({
      mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
    });
    this.#core.setLogger(d => this.#handlers.log.forEach(f => f(d)));
    this.#core.setProgress(d => this.#handlers.progress.forEach(f => f(d)));
    return true;
  }

  async exec(args) {
    this.#core.setTimeout(-1);
    this.#core.exec(...args);
    const ret = this.#core.ret;
    this.#core.reset();
    return ret;
  }

  async writeFile(path, data) { this.#core.FS.writeFile(path, data); return true; }
  async readFile(path)        { return this.#core.FS.readFile(path, { encoding: 'binary' }); }
  async deleteFile(path)      { this.#core.FS.unlink(path); return true; }
  async createDir(path)       { this.#core.FS.mkdir(path); return true; }
  terminate()                 { this.#core = null; }
}

/** 這個瀏覽器能不能跑多執行緒 */
export const canUseMT = () =>
  typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true;

/** 多執行緒大約比單執行緒快這麼多倍（實測 2.56，保守抓 2.3） */
export const MT_SPEEDUP = 2.3;
