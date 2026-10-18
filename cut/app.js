// 精準秒數剪輯｜薇光 AI 課堂
// 全部在瀏覽器裡跑，影片不離開使用者的裝置。
import { FFmpeg } from './lib/ffmpeg/index.js';
import { fetchFile } from './lib/util/index.js';
import { MODELS, loadASR, extractAudio, transcribe, buildCards, toASS, toSRT } from './subtitle.js';
import { FFmpegMT, canUseMT, MT_SPEEDUP } from './lib/mt.js';

// ---------- 可調參數（跟本機版一致）----------
const MAX_SPEEDUP = 1.15;   // 加速上限。超過會警告，因為講話會明顯變快
const TOLERANCE   = 0.15;   // 成品秒數容許誤差
const FPS         = 30;

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const drop=$('drop'), pick=$('pick'), fileList=$('files'), secsIn=$('secs'),
      bLand=$('bLand'), bPort=$('bPort'), go=$('go'),
      progWrap=$('progWrap'), stageEl=$('stage'), pbar=$('pbar'), ppct=$('ppct'), peta=$('peta'),
      planEl=$('plan'), warnEl=$('warn'), doneEl=$('done'), prev=$('prev'), dl=$('dl'),
      verifyEl=$('verify'), errEl=$('err'), dlSrt=$('dlSrt'),
      bSubOn=$('bSubOn'), bSubOff=$('bSubOff'), subOpts=$('subOpts'), subHint=$('subHint'),
      bQBase=$('bQBase'), bQSmall=$('bQSmall'), shortHint=$('shortHint'),
      editWrap=$('editWrap'), editHint=$('editHint'), subList=$('subList'), freezeNote=$('freezeNote'),
      burn=$('burn'), skipBurn=$('skipBurn');

let items = [];        // {file, dur, w, h}
let portrait = false;
let wantSub = true;    // 預設自動上字幕
let quality = 'base';
let ffmpeg = null, loaded = false, engine = 'st';   // st 單執行緒（有進度條）／mt 多執行緒（快但會凍畫面）

// 長度不符一律用變速：太長快轉、太短放慢。
// 用途是學生交考試作業（規定秒數），所以第一優先是「秒數剛好 + 全程有聲音」，
// 任何會產生沒說話片段的做法都不適合，不再提供選項。
const BASE_HINT = '長度不符的話：太長就快轉、太短就放慢。全片都有聲音，不會有空檔';

bSubOn.onclick  = () => { wantSub = true;  bSubOn.classList.add('on');  bSubOff.classList.remove('on'); subOpts.classList.remove('off'); updateHint(); };
bSubOff.onclick = () => { wantSub = false; bSubOff.classList.add('on'); bSubOn.classList.remove('on');  subOpts.classList.add('off'); updateHint(); };
bQBase.onclick  = () => { quality = 'base';  bQBase.classList.add('on');  bQSmall.classList.remove('on'); updateHint(); };
bQSmall.onclick = () => { quality = 'small'; bQSmall.classList.add('on'); bQBase.classList.remove('on');  updateHint(); };

/** 輸出尺寸跟著素材走，不放大。
 *  原本一律輸出 1080p，但素材是 720p 的話，放大只是多編碼一倍的像素，
 *  畫質一點都不會變好（實測檔案只差 0.1 MB），時間卻多 3.6 倍（22.9 → 81.6 秒）。
 *  取所有素材的最長邊當基準，上限 1920。 */
function outputSize() {
  const longest = items.length
    ? Math.max(...items.map(i => Math.max(i.w, i.h)))
    : 1920;
  let base = Math.min(longest || 1920, 1920);
  const even = n => Math.max(2, Math.round(n / 2) * 2);   // H.264 要偶數
  const short = even(base * 9 / 16);
  base = even(base);
  return portrait ? { W: short, H: base } : { W: base, H: short };
}

/** 讓人一眼看到這次會用哪個引擎，不用等跑完才知道 */
function showEngineBadge() {
  const el = $('engine');
  if (!el) return;
  if (canUseMT()) {
    el.className = 'fast';
    el.textContent = '⚡ 快速模式已啟用（處理時畫面會暫停回應幾秒）';
  } else {
    el.className = '';
    const why = window.__coi || '這個瀏覽器不支援';
    el.textContent = `標準模式　${why === '已啟用' ? '' : '（' + why + '）'}`;
    el.title = '功能完全正常，只是處理時間比較長。' + (window.__coi || '');
  }
}
// coi.js 可能還在註冊，等一下再確認一次
showEngineBadge();
setTimeout(showEngineBadge, 1500);
setTimeout(showEngineBadge, 4000);

function updateHint() {
  const m = MODELS[quality];
  const total = items.reduce((s, i) => s + i.dur, 0);
  const target = Math.max(1, parseFloat(secsIn.value) || 60);
  const est = Math.ceil((total || target) * m.rate / 10) * 10;
  subHint.textContent = `繁體中文．英文保留原文．第一次要下載辨識模型約 ${m.mb} MB`
    + (total ? `．辨識這段大約要 ${est >= 60 ? Math.ceil(est / 60) + ' 分鐘' : est + ' 秒'}` : '')
    + '．辨識完會讓你先校對錯字再燒上去';

  let h = BASE_HINT;
  if (total) {
    const sp = total / target;
    if (total > target + 0.15)
      h += `　→ 這次會快轉 ${sp.toFixed(2)} 倍` + (sp > MAX_SPEEDUP ? '，講話會明顯變快' : '');
    else if (total < target - 0.15)
      h += `　→ 這次會放慢到 ${sp.toFixed(2)} 倍` + (sp < 0.85 ? '，會明顯聽得出來' : '');
    else
      h += '　→ 長度剛好，不用調整';
  }
  if (items.length) {
    const { W, H } = outputSize();
    h += `　／　輸出 ${W}×${H}`;
  }
  shortHint.textContent = h;
}
secsIn.addEventListener('input', updateHint);

// ---------- 選檔 ----------
drop.onclick = () => pick.click();
pick.onchange = e => addFiles([...e.target.files]);
['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(f.name))));

bLand.onclick = () => { portrait = false; bLand.classList.add('on'); bPort.classList.remove('on'); updateHint(); };
bPort.onclick = () => { portrait = true;  bPort.classList.add('on'); bLand.classList.remove('on'); updateHint(); };

// 用瀏覽器原生讀 metadata 拿長度和解析度 —— 比丟進 ffmpeg 快非常多
function probe(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const r = { dur: v.duration, w: v.videoWidth, h: v.videoHeight };
      URL.revokeObjectURL(v.src);
      (isFinite(r.dur) && r.dur > 0) ? resolve(r) : reject(new Error('讀不到長度'));
    };
    v.onerror = () => { URL.revokeObjectURL(v.src); reject(new Error('這個格式瀏覽器打不開')); };
    v.src = URL.createObjectURL(file);
  });
}

async function addFiles(files) {
  for (const f of files) {
    try {
      const info = await probe(f);
      items.push({ file: f, ...info });
    } catch (e) {
      showErr(`「${f.name}」讀不到：${e.message}\n可以先用手機或電腦把它轉成 MP4 再試。`);
    }
  }
  render();
}

const esc = s => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function render() {
  fileList.innerHTML = '';
  items.forEach((it, i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="seq">${i + 1}</span>
       <span class="nm">${esc(it.file.name)}<br><span class="du">${it.dur.toFixed(1)}s · ${it.w}×${it.h}</span></span>
       <span class="mv">
         <button data-up="${i}" ${i === 0 ? 'disabled' : ''} title="往前">↑</button>
         <button data-dn="${i}" ${i === items.length - 1 ? 'disabled' : ''} title="往後">↓</button>
       </span>
       <span class="x" data-i="${i}" title="移除">✕</span>`;
    fileList.appendChild(li);
  });
  fileList.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { items.splice(+b.dataset.i, 1); render(); });
  fileList.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const i = +b.dataset.up; [items[i-1], items[i]] = [items[i], items[i-1]]; render(); });
  fileList.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => { const i = +b.dataset.dn; [items[i+1], items[i]] = [items[i], items[i+1]]; render(); });

  const total = items.reduce((s, i) => s + i.dur, 0);
  if (items.length) {
    const li = document.createElement('li');
    li.style.background = 'transparent';
    li.innerHTML = `<span class="nm" style="color:#8a8a8a">合計 ${items.length} 段</span>
                    <span class="du" style="color:#D9347B;font-size:13px">${total.toFixed(1)} 秒</span>`;
    fileList.appendChild(li);
    const note = document.createElement('div');
    note.className = 'orderNote';
    note.textContent = items.length > 1
      ? '上面的順序就是接片順序，用 ↑ ↓ 可以調整。'
      : '';
    fileList.appendChild(note);
  }
  go.disabled = items.length === 0;
  updateHint();
}

// ---------- 進度 ----------
let stageBase = 0, stageSpan = 1, t0 = 0;
function setStage(txt, base, span) { stageEl.textContent = txt; stageBase = base; stageSpan = span; }

/** 多執行緒會把畫面凍住，進度條沒辦法更新，改成純 CSS 的跑馬燈 */
function setBusy(on, seconds) {
  const bar = document.querySelector('.bar');
  if (on) {
    bar.classList.add('busy');
    freezeNote.style.display = 'block';
    freezeNote.textContent =
      `用快速模式處理中，大約 ${Math.max(3, Math.round(seconds))} 秒。
` +
      `這段時間畫面會暫停回應（捲動、按鈕都不會動），上面的長條還在跑就表示正常，請不要關掉分頁。`;
  } else {
    bar.classList.remove('busy');
    freezeNote.style.display = 'none';
  }
}
function setProg(p) {
  // ffmpeg 的 progress 在 concat 時會超過 1（它用時長比例算，接片時總長判斷不準），
  // 不夾住的話整體進度會衝過該階段的上限，剩餘時間就估得太樂觀。
  p = Math.min(1, Math.max(0, p));
  const all = Math.min(1, Math.max(0, stageBase + p * stageSpan));
  pbar.style.width = (all * 100).toFixed(1) + '%';
  ppct.textContent = (all * 100).toFixed(0) + '%';
  if (all > 0.02 && t0) {
    const left = (Date.now() - t0) / all * (1 - all) / 1000;
    peta.textContent = left > 1 ? `大約還要 ${left > 90 ? Math.ceil(left / 60) + ' 分鐘' : Math.ceil(left) + ' 秒'}` : '快好了';
  }
}
const showErr = m => { errEl.style.display = 'block'; errEl.textContent = m; };

// iOS Safari 的 <a download> 對 blob 沒用 —— 它會直接在分頁裡開啟而不是存檔。
// 有 Web Share API 就走系統分享（可以存進「檔案」或相簿），沒有才退回 <a download>。
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      $('saveHint').textContent = '';
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // 使用者自己取消，不用退回下載
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $('saveHint').textContent = '如果沒有跳出儲存，長按上面的影片選「下載」也可以。';
}

// ---------- 載入引擎 ----------
// 單執行緒每 1 秒素材大約要這麼久（720p 實測：30 秒素材 18.4 秒）
const ST_RATE = 0.62;
// 多執行緒會凍住畫面，超過這個秒數就不划算，寧可用慢的但有進度條
const FREEZE_LIMIT = 25;

/** 依這次的工作量挑引擎：夠短就用快的（會凍畫面），太長就用穩的 */
function pickEngine(srcTotal) {
  if (!canUseMT()) return 'st';
  return (srcTotal * ST_RATE / MT_SPEEDUP) <= FREEZE_LIMIT ? 'mt' : 'st';
}

async function ensureLoaded(srcTotal) {
  const want = pickEngine(srcTotal);
  if (loaded && engine === want) return;
  if (loaded) { try { ffmpeg.terminate(); } catch {} loaded = false; }
  engine = want;

  setStage(engine === 'mt'
    ? '第一次使用，正在下載快速引擎（約 32 MB）…'
    : '第一次使用，正在下載影片處理引擎（約 31 MB）…', 0, 0.08);

  if (engine === 'mt') {
    ffmpeg = new FFmpegMT();
    ffmpeg.on('log', d => collectLog(typeof d === 'string' ? d : d.message));
    ffmpeg.on('progress', () => {});   // 畫面凍住時收不到，不用接
    await ffmpeg.load({
      coreURL: new URL('./lib/core-mt/ffmpeg-core.js', location.href).href,
      wasmURL: new URL('./lib/core-mt/ffmpeg-core.wasm', location.href).href,
      workerURL: new URL('./lib/core-mt/ffmpeg-core.worker.js', location.href).href,
    });
  } else {
    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => collectLog(message));
    ffmpeg.on('progress', ({ progress }) => setProg(progress));
    await ffmpeg.load({
      coreURL: new URL('./lib/core/ffmpeg-core.js', location.href).href,
      wasmURL: new URL('./lib/core/ffmpeg-core.wasm', location.href).href,
    });
  }
  loaded = true;
}

let logBuf = [];
const collectLog = m => { logBuf.push(m); if (logBuf.length > 4000) logBuf.shift(); };

// ---------- 組出「把 N 段統一規格並接起來」的 filter ----------
function concatFilter(n, W, H) {
  const parts = [];
  let cat = '';
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
               `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}[v${i}]`);
    parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    cat += `[v${i}][a${i}]`;
  }
  parts.push(`${cat}concat=n=${n}:v=1:a=1[vc][ac]`);
  return parts.join(';');
}

// atempo 一次只吃 0.5～2.0，超出範圍要串接好幾層
function atempoChain(sp) {
  const out = []; let r = sp;
  while (r > 2.0) { out.push('atempo=2.0'); r /= 2.0; }
  while (r < 0.5) { out.push('atempo=0.5'); r /= 0.5; }
  out.push(`atempo=${r.toFixed(6)}`);
  return out.join(',');
}

// ---------- 主流程 ----------
// ---------- 字幕校對 ----------
// 剪輯完先停在這裡，讓人把辨識錯的字改掉再燒。
let pending = null;

const MAXCH = () => (portrait ? 14 : 18);

function showEditor(cards) {
  progWrap.style.display = 'none';
  subList.innerHTML = '';
  cards.forEach(c => {
    const row = document.createElement('div');
    row.className = 'srow';
    const mm = Math.floor(c.start / 60), ss = Math.floor(c.start % 60);
    row.innerHTML = `<span class="t">${mm}:${String(ss).padStart(2, '0')}</span>`;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = c.text;
    inp.dataset.s = c.start;
    inp.dataset.e = c.end;
    const mark = () => inp.classList.toggle('long', [...inp.value].length > MAXCH());
    inp.oninput = mark; mark();
    const del = document.createElement('span');
    del.className = 'del'; del.textContent = '✕';
    del.title = '這張不要';
    del.onclick = () => { row.remove(); refreshEditHint(); };
    row.appendChild(inp); row.appendChild(del);
    subList.appendChild(row);
  });
  refreshEditHint();
  editWrap.style.display = 'block';
  editWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function refreshEditHint() {
  const inputs = [...subList.querySelectorAll('input')];
  const over = inputs.filter(i => [...i.value].length > MAXCH()).length;
  editHint.innerHTML = `辨識出 ${inputs.length} 張字幕，有錯字直接改。✕ 可以把整張刪掉。` +
    (over ? `<br><span style="color:#fbbf24">有 ${over} 張超過 ${MAXCH()} 字（邊框變黃的那幾張），在畫面上會比較擠</span>` : '');
}

function readEditor() {
  return [...subList.querySelectorAll('input')]
    .map(i => ({ start: +i.dataset.s, end: +i.dataset.e, text: i.value.trim() }))
    .filter(c => c.text && c.end > c.start);
}

burn.onclick = async () => {
  const cards = readEditor();
  if (!cards.length) { showErr('字幕全被刪掉了，沒有東西可以燒。'); return; }
  burn.disabled = true; skipBurn.disabled = true;
  editWrap.style.display = 'none';
  progWrap.style.display = 'block';
  try {
    const { W, H, portrait: p } = pending;
    await ffmpeg.writeFile('sub.ass', new TextEncoder().encode(toASS(cards, { W, H, portrait: p })));
    // 這個 core 沒編 fontconfig，所以不能用字型名稱查，要把字型放進目錄再用 fontsdir 指
    try { await ffmpeg.createDir('/fonts'); } catch {}
    await ffmpeg.writeFile('/fonts/MantouSans-Regular.ttf',
      await fetchFile(new URL('./assets/MantouSans-Regular.ttf', location.href).href));

    setStage('把字幕燒進畫面…', 0.80, 0.16);
    if (engine === 'mt') {
      setBusy(true, pending.target * ST_RATE / MT_SPEEDUP * 0.6);
      await new Promise(r => setTimeout(r, 120));
    }
    await ffmpeg.exec(['-i', 'out.mp4', '-vf', 'subtitles=sub.ass:fontsdir=/fonts',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy', 'final.mp4']);
    setBusy(false);
    await finish('final.mp4', cards);
  } catch (e) {
    setBusy(false);
    progWrap.style.display = 'none';
    showErr('燒字幕失敗：' + e);
  } finally {
    burn.disabled = false; skipBurn.disabled = false;
  }
};

skipBurn.onclick = async () => {
  editWrap.style.display = 'none';
  progWrap.style.display = 'block';
  // 字幕檔還是給，只是不燒進畫面
  await finish('out.mp4', readEditor());
};

/** 驗收 + 顯示結果。cards 給了就一起提供 .srt 下載 */
async function finish(fileName, cards) {
  const { W, H, target, t0: start, names } = pending;
  setStage('驗收…', 0.96, 0.04);
  const data = await ffmpeg.readFile(fileName);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  const real = await new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => res(v.duration);
    v.onerror = () => res(NaN);
    v.src = url;
  });

  // 從 ffmpeg 的 log 抓最後回報的幀數。只看秒數會漏掉 fps 掉下來的問題。
  const fm = [...logBuf.join(String.fromCharCode(10)).matchAll(/frame=\s*(\d+)/g)];
  const frames = fm.length ? +fm[fm.length - 1][1] : null;

  setProg(1);
  prev.src = url;
  dl.onclick = () => saveFile(blob, `成品_${Math.round(target)}秒.mp4`);
  $('saveHint').textContent = '';

  const diff = Math.abs(real - target);
  const ok = isFinite(real) && diff <= TOLERANCE;
  verifyEl.innerHTML =
    `長度 <b>${isFinite(real) ? real.toFixed(2) : '?'} 秒</b>（目標 ${target} 秒，差 ${isFinite(real) ? diff.toFixed(2) : '?'} 秒）` +
    `${ok ? '' : ' <span style="color:#fbbf24">⚠ 秒數沒對上</span>'}<br>` +
    `${W}×${H}　${frames && isFinite(real) ? (frames / real).toFixed(1) + ' fps　' : ''}` +
    `${(blob.size / 1024 / 1024).toFixed(1)} MB　耗時 ${Math.round((Date.now() - start) / 1000)} 秒` +
    (cards && cards.length ? `<br>字幕 ${cards.length} 張${fileName === 'out.mp4' ? '（沒燒進畫面，只給檔案）' : ''}` : '');

  if (cards && cards.length) {
    const srtBlob = new Blob([toSRT(cards)], { type: 'text/plain;charset=utf-8' });
    dlSrt.style.display = 'block';
    dlSrt.onclick = () => saveFile(srtBlob, `字幕_${Math.round(target)}秒.srt`);
  } else dlSrt.style.display = 'none';

  doneEl.style.display = 'block';
  progWrap.style.display = 'none';
  doneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // 清掉虛擬硬碟，免得連續做幾支就爆記憶體
  for (const n of [...(names || []), 'out.mp4', 'final.mp4', 'sub.ass']) {
    try { await ffmpeg.deleteFile(n); } catch {}
  }
  go.disabled = items.length === 0;
}

go.onclick = async () => {
  editWrap.style.display = 'none';
  errEl.style.display = 'none'; warnEl.style.display = 'none'; doneEl.style.display = 'none';
  progWrap.style.display = 'block'; go.disabled = true; planEl.textContent = '';
  t0 = Date.now(); logBuf = [];

  const target = Math.max(1, parseFloat(secsIn.value) || 60);
  const { W, H } = outputSize();
  const srcTotal = items.reduce((s, i) => s + i.dur, 0);

  try {
    await ensureLoaded(srcTotal);

    // 把檔案寫進 wasm 的虛擬硬碟
    setStage('讀取影片…', 0.08, 0.04);
    const names = [];
    for (let i = 0; i < items.length; i++) {
      const ext = (items[i].file.name.match(/\.[a-z0-9]+$/i) || ['.mp4'])[0];
      const n = `in${i}${ext}`;
      await ffmpeg.writeFile(n, await fetchFile(items[i].file));
      names.push(n);
      setProg((i + 1) / items.length);
    }
    const inputs = names.flatMap(n => ['-i', n]);

    // ── 長度一律用變速調整：太長快轉、太短放慢 ──
    // 用途是學生交考試作業（規定秒數），第一優先是「秒數剛好 + 全程有聲音」，
    // 所以不砍內容、也不補靜音，一律動速度。
    const ratio = srcTotal / target;
    const plan = Math.abs(srcTotal - target) <= TOLERANCE
      ? { kind: 'cut', note: '長度本來就剛好' }
      : { kind: 'speed', sp: ratio,
          note: ratio > 1 ? `快轉 ${ratio.toFixed(3)} 倍` : `放慢到 ${ratio.toFixed(3)} 倍` };

    if (plan.kind === 'speed' && (plan.sp > MAX_SPEEDUP || plan.sp < 0.85)) {
      warnEl.style.display = 'block';
      warnEl.textContent = plan.sp > MAX_SPEEDUP
        ? `⚠ 要快轉 ${plan.sp.toFixed(2)} 倍才塞得進 ${target} 秒，講話會明顯變快。
`
          + `想避免的話：把目標改成 ${Math.ceil(srcTotal / MAX_SPEEDUP)} 秒以上，或先自己把素材剪短一點。`
        : `⚠ 要放慢到 ${plan.sp.toFixed(2)} 倍才填得滿 ${target} 秒，會明顯聽得出來。
`
          + `想避免的話：素材再多拍一點，讓長度接近 ${target} 秒。`;
    }
    planEl.textContent = plan.note;

    // ── 合併和調整一次做完（只動速度的話不需要分兩段編碼）──
    const needASR = wantSub;   // 要辨識的話，後段進度要留給它
    setStage('輸出成品…', 0.12, needASR ? 0.30 : 0.84);
    let fc = concatFilter(items.length, W, H);
    // ⚠ setpts 後面一定要接 fps。它只是改時間戳，不會生出新的幀 ——
    //   放慢的話幀數不變、時間變長，fps 就掉下來（45 秒 1350 幀放慢成 60 秒＝22.5 fps）。
    //   秒數驗收看不出這個問題，要看「影格數 ÷ 時長」。
    fc += plan.kind === 'speed'
      ? `;[vc]setpts=PTS/${plan.sp.toFixed(6)},fps=${FPS}[v];[ac]${atempoChain(plan.sp)}[a]`
      : ';[vc]null[v];[ac]anull[a]';
    if (engine === 'mt') {
      setBusy(true, srcTotal * ST_RATE / MT_SPEEDUP);
      await new Promise(r => setTimeout(r, 120));   // 讓跑馬燈先畫出來再凍結
    }
    await ffmpeg.exec([...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
      '-t', String(target),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', 'out.mp4']);
    setBusy(false);

    // ── 字幕：先產生，然後停下來給人校對 ──
    pending = { W, H, portrait, target, t0, names };

    if (!wantSub) { await finish('out.mp4', null); return; }

    // 先剪再辨識：這樣字幕時間一定對，不用因為變速去重算時間軸
    setStage('抽出聲音…', 0.42, 0.02);
    const audioURL = await extractAudio(ffmpeg, 'out.mp4');

    setStage(`載入辨識模型（第一次要下載約 ${MODELS[quality].mb} MB）…`, 0.44, 0.08);
    const asr = await loadASR(quality, p => setProg(p));

    // 辨識本身不回報進度，用實測速率推一個預估進度，免得畫面像當掉
    setStage('辨識語音…', 0.52, 0.40);
    const estMs = Math.max(3000, target * MODELS[quality].rate * 1000);
    const tick0 = Date.now();
    const tick = setInterval(() => setProg(Math.min(0.97, (Date.now() - tick0) / estMs)), 400);
    let segs;
    try { segs = await transcribe(asr, audioURL); } finally { clearInterval(tick); }
    setProg(1);
    const cards = buildCards(segs, { maxChars: portrait ? 14 : 18, totalDur: target });

    if (!cards.length) {
      planEl.textContent += '\n（這段聲音辨識不出內容）';
      await finish('out.mp4', null);
      return;
    }
    showEditor(cards);

  } catch (e) {
    setBusy(false);
    progWrap.style.display = 'none';
    const msg = String(e);
    let hint = '';
    if (/memory|Memory|allocat|RangeError/i.test(msg))
      hint = '\n\n看起來是記憶體不夠。試試看：素材少放幾段、改成直式以外的比例、或換到電腦上做。';
    else if (/Stream specifier|does not contain any stream|Invalid argument/i.test(msg))
      hint = '\n\n有一段影片可能沒有聲音軌。目前每段都需要有聲音，可以先幫它配一段無聲音軌再試。';
    showErr('剪輯失敗：' + msg + hint);
  } finally {
    go.disabled = items.length === 0;
  }
};
