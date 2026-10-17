// 精準秒數剪輯．語音版｜薇光 AI 課堂
// 跟影片版同一套長度調整邏輯，只是不處理畫面，所以快很多。
import { FFmpeg } from '../lib/ffmpeg/index.js';
import { fetchFile } from '../lib/util/index.js';
import { MODELS, loadASR, transcribe, buildCards, toSRT } from '../subtitle.js';

const MAX_SPEEDUP = 1.15;
const TOLERANCE   = 0.15;

const $ = id => document.getElementById(id);
const drop=$('drop'), pick=$('pick'), fileList=$('files'), secsIn=$('secs'), go=$('go'),
      progWrap=$('progWrap'), stageEl=$('stage'), pbar=$('pbar'), ppct=$('ppct'), peta=$('peta'),
      planEl=$('plan'), warnEl=$('warn'), doneEl=$('done'), prev=$('prev'), dl=$('dl'),
      dlSrt=$('dlSrt'), verifyEl=$('verify'), errEl=$('err'), shortHint=$('shortHint'), subHint=$('subHint'),
      bSubOn=$('bSubOn'), bSubOff=$('bSubOff');

let items = [];
let wantSrt = false;
let ffmpeg = null, loaded = false;

// 長度不符一律用變速：太長快轉、太短放慢。
// 用途是學生交作業（規定秒數），第一優先是「秒數剛好 + 全程有聲音」，
// 會產生沒說話片段的做法都不適合，所以不提供選項。
const BASE_HINT = '長度不符的話：太長就快轉、太短就放慢。全程都有聲音，不會有空檔';
bSubOn.onclick  = () => { wantSrt = true;  bSubOn.classList.add('on');  bSubOff.classList.remove('on'); updateHint(); };
bSubOff.onclick = () => { wantSrt = false; bSubOff.classList.add('on'); bSubOn.classList.remove('on'); updateHint(); };
secsIn.addEventListener('input', updateHint);

drop.onclick = () => pick.click();
pick.onchange = e => addFiles([...e.target.files]);
['dragenter','dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]
  .filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac|opus)$/i.test(f.name))));

// 用瀏覽器原生讀 metadata 拿長度，比丟進 ffmpeg 快很多
function probe(file) {
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      const d = a.duration;
      URL.revokeObjectURL(a.src);
      (isFinite(d) && d > 0) ? resolve(d) : reject(new Error('讀不到長度'));
    };
    a.onerror = () => { URL.revokeObjectURL(a.src); reject(new Error('這個格式瀏覽器打不開')); };
    a.src = URL.createObjectURL(file);
  });
}

async function addFiles(files) {
  for (const f of files) {
    try { items.push({ file: f, dur: await probe(f) }); }
    catch (e) { showErr(`「${f.name}」讀不到：${e.message}\n可以先轉成 MP3 再試。`); }
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
       <span class="nm">${esc(it.file.name)}<br><span class="du">${it.dur.toFixed(1)} 秒</span></span>
       <span class="mv">
         <button data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
         <button data-dn="${i}" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
       </span>
       <span class="x" data-i="${i}">✕</span>`;
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
    if (items.length > 1) {
      const note = document.createElement('div');
      note.className = 'orderNote';
      note.textContent = '上面的順序就是接起來的順序，用 ↑ ↓ 可以調整。';
      fileList.appendChild(note);
    }
  }
  go.disabled = items.length === 0;
  updateHint();
}

function updateHint() {
  const total = items.reduce((s, i) => s + i.dur, 0);
  const target = Math.max(1, parseFloat(secsIn.value) || 60);
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
  shortHint.textContent = h;
  subHint.textContent = wantSrt
    ? `辨識成繁體中文字幕檔．第一次要下載辨識模型約 ${MODELS.base.mb} MB`
      + (total ? `．大約要 ${Math.ceil(total * MODELS.base.rate / 10) * 10} 秒` : '')
    : '辨識成繁體中文字幕檔，可以拿去配影片用';
}

let stageBase = 0, stageSpan = 1, t0 = 0;
function setStage(txt, base, span) { stageEl.textContent = txt; stageBase = base; stageSpan = span; }
function setProg(p) {
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

// iOS Safari 的 <a download> 對 blob 沒用，會在分頁裡開啟而不是存檔
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); $('saveHint').textContent = ''; return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $('saveHint').textContent = '如果沒有跳出儲存，長按上面的播放器選「下載」也可以。';
}

let logBuf = [];

// atempo 一次只吃 0.5～2.0，兩個方向超出都要串接
function atempoChain(sp) {
  const out = []; let r = sp;
  while (r > 2.0) { out.push('atempo=2.0'); r /= 2.0; }
  while (r < 0.5) { out.push('atempo=0.5'); r /= 0.5; }
  out.push(`atempo=${r.toFixed(6)}`);
  return out.join(',');
}

go.onclick = async () => {
  errEl.style.display = 'none'; warnEl.style.display = 'none'; doneEl.style.display = 'none';
  progWrap.style.display = 'block'; go.disabled = true; planEl.textContent = '';
  t0 = Date.now(); logBuf = [];

  const target = Math.max(1, parseFloat(secsIn.value) || 60);
  const srcTotal = items.reduce((s, i) => s + i.dur, 0);
  const ENC = ['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100'];

  try {
    if (!loaded) {
      setStage('第一次使用，正在下載處理引擎（約 31 MB）…', 0, 0.06);
      ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => { logBuf.push(message); if (logBuf.length > 4000) logBuf.shift(); });
      ffmpeg.on('progress', ({ progress }) => setProg(progress));
      await ffmpeg.load({
        coreURL: new URL('../lib/core/ffmpeg-core.js', location.href).href,
        wasmURL: new URL('../lib/core/ffmpeg-core.wasm', location.href).href,
      });
      loaded = true;
    }

    setStage('讀取語音…', 0.06, 0.04);
    const names = [];
    for (let i = 0; i < items.length; i++) {
      const ext = (items[i].file.name.match(/\.[a-z0-9]+$/i) || ['.mp3'])[0];
      const n = `in${i}${ext}`;
      await ffmpeg.writeFile(n, await fetchFile(items[i].file));
      names.push(n);
      setProg((i + 1) / items.length);
    }
    const inputs = names.flatMap(n => ['-i', n]);
    const catFilter = items.length === 1
      ? '[0:a]aresample=44100[a]'
      : items.map((_, i) => `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`).join(';')
        + ';' + items.map((_, i) => `[a${i}]`).join('') + `concat=n=${items.length}:v=0:a=1[a]`;

    // ── 長度一律用變速調整：太長快轉、太短放慢 ──
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
          + `想避免的話：把目標改成 ${Math.ceil(srcTotal / MAX_SPEEDUP)} 秒以上，或先自己剪短一點。`
        : `⚠ 要放慢到 ${plan.sp.toFixed(2)} 倍才填得滿 ${target} 秒，會明顯聽得出來。
`
          + `想避免的話：素材再多錄一點，讓長度接近 ${target} 秒。`;
    }
    planEl.textContent = plan.note;

    // ── 合併和調整一次做完 ──
    setStage('輸出 MP3…', 0.10, wantSrt ? 0.30 : 0.86);
    let fc = catFilter.replace(/\[a\]$/, '[ac]');
    fc += plan.kind === 'speed' ? `;[ac]${atempoChain(plan.sp)}[a]` : ';[ac]anull[a]';
    await ffmpeg.exec([...inputs, '-filter_complex', fc, '-map', '[a]',
      '-t', String(target), ...ENC, 'out.mp3']);

    // ── 字幕（選配）──
    let srtBlob = null, cardCount = 0;
    if (wantSrt) {
      setStage(`載入辨識模型（第一次要下載約 ${MODELS.base.mb} MB）…`, 0.40, 0.10);
      const asr = await loadASR('base', p => setProg(p));
      setStage('辨識語音…', 0.50, 0.45);
      const wav = await ffmpeg.readFile('out.mp3');
      const url = URL.createObjectURL(new Blob([wav.buffer], { type: 'audio/mpeg' }));
      const estMs = Math.max(3000, target * MODELS.base.rate * 1000);
      const tick0 = Date.now();
      const tick = setInterval(() => setProg(Math.min(0.97, (Date.now() - tick0) / estMs)), 400);
      let segs;
      try { segs = await transcribe(asr, url); } finally { clearInterval(tick); }
      const cards = buildCards(segs, { maxChars: 18, totalDur: target });
      cardCount = cards.length;
      if (cards.length) srtBlob = new Blob([toSRT(cards)], { type: 'text/plain;charset=utf-8' });
    }

    // ── 驗收 ──
    setStage('驗收…', 0.96, 0.04);
    const data = await ffmpeg.readFile('out.mp3');
    const blob = new Blob([data.buffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const real = await new Promise(res => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => res(a.duration);
      a.onerror = () => res(NaN);
      a.src = url;
    });

    setProg(1);
    prev.src = url;
    dl.onclick = () => saveFile(blob, `成品_${Math.round(target)}秒.mp3`);
    $('saveHint').textContent = '';
    if (srtBlob) {
      dlSrt.style.display = 'block';
      dlSrt.onclick = () => saveFile(srtBlob, `字幕_${Math.round(target)}秒.srt`);
    } else dlSrt.style.display = 'none';

    const diff = Math.abs(real - target);
    verifyEl.innerHTML =
      `長度 <b>${isFinite(real) ? real.toFixed(2) : '?'} 秒</b>（目標 ${target} 秒，差 ${isFinite(real) ? diff.toFixed(2) : '?'} 秒）` +
      `${diff <= TOLERANCE ? '' : ' <span style="color:#fbbf24">⚠ 秒數沒對上</span>'}<br>` +
      `MP3 192 kbps　${(blob.size / 1024 / 1024).toFixed(2)} MB　耗時 ${Math.round((Date.now() - t0) / 1000)} 秒` +
      (cardCount ? `<br>字幕 ${cardCount} 張` : '');
    doneEl.style.display = 'block';
    progWrap.style.display = 'none';
    doneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    for (const n of [...names, 'out.mp3']) { try { await ffmpeg.deleteFile(n); } catch {} }

  } catch (e) {
    progWrap.style.display = 'none';
    const msg = String(e);
    let hint = '';
    if (/memory|Memory|allocat|RangeError/i.test(msg)) hint = '\n\n記憶體不夠。試試看：段數少一點、檔案短一點，或改用電腦做。';
    showErr('處理失敗：' + msg + hint);
  } finally {
    go.disabled = items.length === 0;
  }
};

render();
