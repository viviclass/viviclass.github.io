// 精準秒數剪輯｜薇光 AI 課堂
// 全部在瀏覽器裡跑，影片不離開使用者的裝置。
import { FFmpeg } from './lib/ffmpeg/index.js';
import { fetchFile } from './lib/util/index.js';
import { MODELS, loadASR, extractAudio, transcribe, buildCards, toASS, toSRT } from './subtitle.js';

// ---------- 可調參數（跟本機版一致）----------
const MAX_SPEEDUP = 1.15;   // 加速上限。超過會警告，因為講話會明顯變快
const TOLERANCE   = 0.15;   // 成品秒數容許誤差
const MIN_SILENCE = 0.8;    // 多久以上算「長停頓」
const FPS         = 30;

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const drop=$('drop'), pick=$('pick'), fileList=$('files'), secsIn=$('secs'),
      bLand=$('bLand'), bPort=$('bPort'), go=$('go'),
      progWrap=$('progWrap'), stageEl=$('stage'), pbar=$('pbar'), ppct=$('ppct'), peta=$('peta'),
      planEl=$('plan'), warnEl=$('warn'), doneEl=$('done'), prev=$('prev'), dl=$('dl'),
      verifyEl=$('verify'), errEl=$('err'), dlSrt=$('dlSrt'),
      bSubOn=$('bSubOn'), bSubOff=$('bSubOff'), subOpts=$('subOpts'), subHint=$('subHint'),
      bQBase=$('bQBase'), bQSmall=$('bQSmall'),
      bPause=$('bPause'), bPad=$('bPad'), bSlow=$('bSlow'), shortHint=$('shortHint');

let items = [];        // {file, dur, w, h}
let portrait = false;
let wantSub = true;    // 預設自動上字幕
let quality = 'base';
// 長度不符時怎麼補。預設 slow：太長快轉、太短放慢，全片都有聲音。
// 考試作業規定秒數的情境下，這個最安全 —— 不會出現任何沒聲音的空檔。
let shortMode = 'slow';    // slow 變速 / pause 調整停頓 / pad 定格補尾
let ffmpeg = null, loaded = false;

const SHORT_HINT = {
  slow:  '太長就快轉、太短就放慢。全片都有聲音，不會有空檔',
  pause: '太長就砍掉停頓、太短就拉長停頓。說話速度不變，但中間會有安靜的片段',
  pad:   '最後一幀定格補到指定秒數。補太多的話結尾會有一段沒聲音',
};
function pickShort(mode, btn) {
  shortMode = mode;
  [bPause, bPad, bSlow].forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  updateHint();
}
bPause.onclick = () => pickShort('pause', bPause);
bPad.onclick   = () => pickShort('pad', bPad);
bSlow.onclick  = () => pickShort('slow', bSlow);

bSubOn.onclick  = () => { wantSub = true;  bSubOn.classList.add('on');  bSubOff.classList.remove('on'); subOpts.classList.remove('off'); };
bSubOff.onclick = () => { wantSub = false; bSubOff.classList.add('on'); bSubOn.classList.remove('on');  subOpts.classList.add('off'); };
bQBase.onclick  = () => { quality = 'base';  bQBase.classList.add('on');  bQSmall.classList.remove('on'); updateHint(); };
bQSmall.onclick = () => { quality = 'small'; bQSmall.classList.add('on'); bQBase.classList.remove('on');  updateHint(); };

function updateHint() {
  const m = MODELS[quality];
  const total = items.reduce((s, i) => s + i.dur, 0);
  const target = Math.max(1, parseFloat(secsIn.value) || 60);
  const est = Math.ceil((total || target) * m.rate / 10) * 10;
  subHint.textContent = `繁體中文．英文保留原文．第一次要下載辨識模型約 ${m.mb} MB`
    + (total ? `．辨識這段大約要 ${est >= 60 ? Math.ceil(est / 60) + ' 分鐘' : est + ' 秒'}` : '');

  let h = SHORT_HINT[shortMode];
  if (total) {
    const sp = total / target;
    if (total > target + 0.15) {
      if (shortMode === 'slow' || sp <= MAX_SPEEDUP)
        h += `　→ 這次會快轉 ${sp.toFixed(2)} 倍` + (sp > MAX_SPEEDUP ? '，講話會明顯變快' : '');
      else h += '　→ 這次會先砍掉停頓再快轉';
    } else if (total < target - 0.15) {
      const need = target - total;
      if (shortMode === 'slow')     h += `　→ 這次會放慢到 ${sp.toFixed(2)} 倍` + (sp < 0.85 ? '，會明顯聽得出來' : '');
      else if (shortMode === 'pad') h += `　→ 這次結尾會定格 ${need.toFixed(0)} 秒`;
      else                          h += `　→ 這次要在停頓裡補 ${need.toFixed(0)} 秒`;
    } else {
      h += '　→ 長度剛好，不用調整';
    }
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

bLand.onclick = () => { portrait = false; bLand.classList.add('on'); bPort.classList.remove('on'); };
bPort.onclick = () => { portrait = true;  bPort.classList.add('on'); bLand.classList.remove('on'); };

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
async function ensureLoaded() {
  if (loaded) return;
  setStage('第一次使用，正在下載影片處理引擎（約 31 MB）…', 0, 0.08);
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => collectLog(message));
  ffmpeg.on('progress', ({ progress }) => setProg(progress));
  await ffmpeg.load({
    coreURL: new URL('./lib/core/ffmpeg-core.js', location.href).href,
    wasmURL: new URL('./lib/core/ffmpeg-core.wasm', location.href).href,
  });
  loaded = true;
}

let logBuf = [];
const collectLog = m => { logBuf.push(m); if (logBuf.length > 4000) logBuf.shift(); };

// ---------- 組出「把 N 段統一規格並接起來」的 filter ----------
function concatFilter(n, W, H, tail) {
  const parts = [];
  let cat = '';
  for (let i = 0; i < n; i++) {
    parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
               `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}[v${i}]`);
    parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    cat += `[v${i}][a${i}]`;
  }
  parts.push(`${cat}concat=n=${n}:v=1:a=1${tail ? '[vc][ac]' : '[v][a]'}`);
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

/** 把要補的時間分散到說話之間的停頓裡，說話速度完全不動。
 *  只挑最長的幾個停頓來拉，不然 filter 會長到 wasm 吃不消。 */
function planStretch(silences, totalDur, needExtra, maxPauses = 6) {
  const usable = silences
    .filter(s => s.end - s.start > 0.3)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, maxPauses)
    .sort((a, b) => a.start - b.start);
  if (!usable.length) return null;

  const per = needExtra / usable.length;
  const segs = [];
  let cur = 0;
  for (const s of usable) {
    if (s.start > cur + 0.05) segs.push({ start: cur, end: s.start, stretch: 1 });
    const dur = s.end - s.start;
    segs.push({ start: s.start, end: s.end, stretch: (dur + per) / dur });
    cur = s.end;
  }
  if (cur < totalDur - 0.05) segs.push({ start: cur, end: totalDur, stretch: 1 });
  return segs;
}

/** 把分段計畫組成 filter_complex */
function stretchFilter(segs) {
  const parts = [], labels = [];
  segs.forEach((s, i) => {
    const t = `trim=${s.start.toFixed(3)}:${s.end.toFixed(3)}`;
    const at = `atrim=${s.start.toFixed(3)}:${s.end.toFixed(3)}`;
    parts.push(`[0:v]${t},setpts=${s.stretch === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)*${s.stretch.toFixed(6)}`}[sv${i}]`);
    // 停頓本來就是靜音，放慢聽不出來
    parts.push(`[0:a]${at},asetpts=PTS-STARTPTS${s.stretch === 1 ? '' : `,${atempoChain(1 / s.stretch)}`}[sa${i}]`);
    labels.push(`[sv${i}][sa${i}]`);
  });
  parts.push(`${labels.join('')}concat=n=${segs.length}:v=1:a=1[v][a]`);
  return parts.join(';');
}

// ---------- 主流程 ----------
go.onclick = async () => {
  errEl.style.display = 'none'; warnEl.style.display = 'none'; doneEl.style.display = 'none';
  progWrap.style.display = 'block'; go.disabled = true; planEl.textContent = '';
  t0 = Date.now(); logBuf = [];

  const target = Math.max(1, parseFloat(secsIn.value) || 60);
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  const srcTotal = items.reduce((s, i) => s + i.dur, 0);

  try {
    await ensureLoaded();

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

    // ── 預先判斷策略。能一次做完就不要編碼兩次（省一半時間）──
    const ratio = srcTotal / target;
    let plan, oneShot = true;
    if (Math.abs(srcTotal - target) <= TOLERANCE) {
      plan = { kind: 'cut', note: '長度本來就剛好' };
    } else if (srcTotal > target) {
      // 變速模式一律快轉到底，不砍內容 —— 考試作業要的是秒數剛好且全程有聲音
      if (shortMode === 'slow' || ratio <= MAX_SPEEDUP)
        plan = { kind: 'speed', sp: ratio, note: `快轉 ${ratio.toFixed(3)} 倍` };
      else { plan = { kind: 'trim' }; oneShot = false; }   // 其他模式才先砍停頓
    } else {
      const need = target - srcTotal;
      if (shortMode === 'pad')       plan = { kind: 'pad', pad: need, note: `定格補尾 ${need.toFixed(2)} 秒` };
      else if (shortMode === 'slow') plan = { kind: 'speed', sp: ratio, note: `放慢到 ${ratio.toFixed(3)} 倍` };
      else { plan = { kind: 'stretch', need }; oneShot = false; }  // 拉長停頓要先偵測靜音
    }

    let src = null;        // 兩階段時的中間檔
    let curDur = srcTotal; // 砍完停頓後的實際長度，警告訊息要用這個算

    if (!oneShot) {
      // 階段一：先合併
      setStage(`合併 ${items.length} 段素材…`, 0.12, 0.38);
      await ffmpeg.exec([...inputs, '-filter_complex', concatFilter(items.length, W, H, false),
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', 'merged.mp4']);
      for (const n of names) { try { await ffmpeg.deleteFile(n); } catch {} }

      // 偵測停頓。太長要砍、太短要拉，兩種情況都得先知道停頓在哪
      setStage(plan.kind === 'stretch' ? '正在找說話之間的空檔…' : '太長了，正在找可以砍掉的停頓…', 0.50, 0.06);
      logBuf = [];
      const detectD = plan.kind === 'stretch' ? 0.35 : MIN_SILENCE;   // 要拉長的話，短一點的空檔也算
      await ffmpeg.exec(['-i', 'merged.mp4', '-af', `silencedetect=noise=-32dB:d=${detectD}`, '-f', 'null', '-']);
      const text = logBuf.join('\n');
      const starts = [...text.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => +m[1]);
      const ends   = [...text.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => +m[1]);

      // ── 太短：把要補的時間分散到停頓裡，說話速度完全不動 ──
      if (plan.kind === 'stretch') {
        const sil = starts.map((s, i) => ({ start: s, end: i < ends.length ? ends[i] : srcTotal }))
                          .filter(x => x.end > x.start);
        const segs = planStretch(sil, srcTotal, plan.need);
        if (segs && segs.some(s => s.stretch > 1)) {
          const n = segs.filter(s => s.stretch > 1).length;
          planEl.textContent = `合併後 ${srcTotal.toFixed(2)} 秒\n在 ${n} 個停頓裡補上 ${plan.need.toFixed(1)} 秒，說話速度不變`;
          setStage('拉長停頓…', 0.56, 0.20);
          await ffmpeg.exec(['-i', 'merged.mp4', '-filter_complex', stretchFilter(segs),
            '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', 'stretched.mp4']);
          try { await ffmpeg.deleteFile('merged.mp4'); } catch {}
          src = 'stretched.mp4';
          curDur = target;
          plan = { kind: 'cut', note: `拉長了 ${n} 個停頓` };
        } else {
          planEl.textContent = `合併後 ${srcTotal.toFixed(2)} 秒\n找不到可以拉長的空檔，改用定格補尾`;
          src = 'merged.mp4';
          curDur = srcTotal;
          plan = { kind: 'pad', pad: plan.need, note: `定格補尾 ${plan.need.toFixed(2)} 秒` };
        }
      } else {

      // ── 太長：每段停頓留 0.25 秒當呼吸，其餘砍掉 ──
      const keep = []; let cursor = 0;
      for (let i = 0; i < starts.length; i++) {
        const s = starts[i], e = (i < ends.length ? ends[i] : srcTotal);
        if (e - s < MIN_SILENCE + 0.2) continue;
        if (s + 0.25 > cursor) keep.push([cursor, s + 0.25]);
        cursor = Math.max(e - 0.1, cursor);
      }
      if (cursor < srcTotal) keep.push([cursor, srcTotal]);
      const kept = keep.reduce((s, k) => s + (k[1] - k[0]), 0);

      if (keep.length > 1 && kept < srcTotal - 0.3) {
        planEl.textContent = `合併後 ${srcTotal.toFixed(2)} 秒\n砍掉 ${starts.length} 段停頓 → ${kept.toFixed(2)} 秒`;
        const sel = keep.map(k => `between(t,${k[0].toFixed(3)},${k[1].toFixed(3)})`).join('+');
        setStage('砍掉停頓…', 0.56, 0.20);
        await ffmpeg.exec(['-i', 'merged.mp4',
          '-vf', `select='${sel}',setpts=N/FRAME_RATE/TB`,
          '-af', `aselect='${sel}',asetpts=N/SR/TB`,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', 'trimmed.mp4']);
        try { await ffmpeg.deleteFile('merged.mp4'); } catch {}
        src = 'trimmed.mp4';
      } else {
        planEl.textContent = `合併後 ${srcTotal.toFixed(2)} 秒\n沒有找到可以砍的停頓`;
        src = 'merged.mp4';
      }

      curDur = (kept > 0 && src === 'trimmed.mp4') ? kept : srcTotal;
      const r2 = curDur / target;
      plan = r2 > 1 ? { kind: 'speed', sp: r2, note: `加速 ${r2.toFixed(3)} 倍` }
           : r2 < 1 ? { kind: 'pad', pad: target - curDur, note: `補尾 ${(target - curDur).toFixed(2)} 秒` }
                    : { kind: 'cut', note: '剛好' };
      }   // ← 太長那條路結束
    }

    // 加速超過安全線要講。建議秒數要用「砍完停頓後」的長度算，
    // 用原始總長會算出一個過大的數字（45/1.15=40，但實際只要 31 就夠）。
    if (plan.kind === 'speed' && plan.sp > MAX_SPEEDUP) {
      warnEl.style.display = 'block';
      warnEl.textContent =
        `⚠ 要加速 ${plan.sp.toFixed(2)} 倍才塞得進 ${target} 秒，超過建議的 ${MAX_SPEEDUP} 倍，講話會明顯變快。\n` +
        `想避免的話：把目標改成 ${Math.ceil(curDur / MAX_SPEEDUP)} 秒以上，或先自己把素材剪短一點。`;
    }

    planEl.textContent = (planEl.textContent ? planEl.textContent + '\n' : '') + plan.note;

    // ── 最後一步：套用策略並輸出 ──
    // 有字幕的話剪輯只佔前段，後面要留給辨識和燒字幕
    const EDIT_END = wantSub ? 0.42 : 1.0;
    const encBase  = oneShot ? 0.12 : (wantSub ? 0.32 : 0.76);
    setStage('輸出成品…', encBase, Math.max(0.05, EDIT_END - encBase - (wantSub ? 0 : 0.04)));
    const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
                 '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'];
    const args = [];

    if (oneShot) {
      // 合併和調整一次做完
      args.push(...inputs);
      let fc = concatFilter(items.length, W, H, true);
      if (plan.kind === 'speed')
        fc += `;[vc]setpts=PTS/${plan.sp.toFixed(6)}[v];[ac]${atempoChain(plan.sp)}[a]`;
      else if (plan.kind === 'pad')
        fc += `;[vc]tpad=stop_mode=clone:stop_duration=${(plan.pad + 0.5).toFixed(3)}[v];[ac]apad=pad_dur=${(plan.pad + 0.5).toFixed(3)}[a]`;
      else
        fc += `;[vc]null[v];[ac]anull[a]`;
      args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]');
    } else {
      args.push('-i', src);
      if (plan.kind === 'speed')
        args.push('-filter_complex', `[0:v]setpts=PTS/${plan.sp.toFixed(6)}[v];[0:a]${atempoChain(plan.sp)}[a]`, '-map', '[v]', '-map', '[a]');
      else if (plan.kind === 'pad')
        args.push('-vf', `tpad=stop_mode=clone:stop_duration=${(plan.pad + 0.5).toFixed(3)}`,
                  '-af', `apad=pad_dur=${(plan.pad + 0.5).toFixed(3)}`);
    }
    args.push('-t', String(target), ...enc, 'out.mp4');
    await ffmpeg.exec(args);

    // ── 字幕 ──
    let finalName = 'out.mp4', srtBlob = null, cardCount = 0;
    if (wantSub) {
      // 先剪再辨識：這樣字幕時間一定對，不用因為變速去重算時間軸
      setStage('抽出聲音…', 0.42, 0.02);
      const audioURL = await extractAudio(ffmpeg, 'out.mp4');

      setStage(`載入辨識模型（第一次要下載約 ${MODELS[quality].mb} MB）…`, 0.44, 0.08);
      const asr = await loadASR(quality, p => setProg(p));

      // 辨識本身不回報進度，用實測速率推一個預估進度，免得畫面像當掉
      setStage('辨識語音…', 0.52, 0.28);
      const estMs = Math.max(3000, target * MODELS[quality].rate * 1000);
      const tick0 = Date.now();
      const tick = setInterval(() => setProg(Math.min(0.97, (Date.now() - tick0) / estMs)), 400);
      let segs;
      try { segs = await transcribe(asr, audioURL); } finally { clearInterval(tick); }
      setProg(1);

      const cards = buildCards(segs, { maxChars: portrait ? 14 : 18, totalDur: target });
      cardCount = cards.length;

      if (cards.length) {
        const ass = toASS(cards, { W, H, portrait });
        await ffmpeg.writeFile('sub.ass', new TextEncoder().encode(ass));
        // 這個 core 沒編 fontconfig，所以不能用字型名稱查，要把字型放進目錄再用 fontsdir 指
        try { await ffmpeg.createDir('/fonts'); } catch {}
        await ffmpeg.writeFile('/fonts/MantouSans-Regular.ttf',
          await fetchFile(new URL('./assets/MantouSans-Regular.ttf', location.href).href));

        setStage('把字幕燒進畫面…', 0.80, 0.16);
        await ffmpeg.exec(['-i', 'out.mp4', '-vf', 'subtitles=sub.ass:fontsdir=/fonts',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
          '-c:a', 'copy', 'final.mp4']);
        finalName = 'final.mp4';

        srtBlob = new Blob([toSRT(cards)], { type: 'text/plain;charset=utf-8' });
      } else {
        planEl.textContent += '\n（這段聲音辨識不出內容，沒有加字幕）';
      }
    }

    // ── 驗收 ──
    setStage('驗收…', 0.96, 0.04);
    const data = await ffmpeg.readFile(finalName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);

    const real = await new Promise(res => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => res(v.duration);
      v.onerror = () => res(NaN);
      v.src = url;
    });

    setProg(1);
    prev.src = url;
    const outName = `成品_${Math.round(target)}秒.mp4`;
    dl.onclick = () => saveFile(blob, outName);
    $('saveHint').textContent = '';
    const diff = Math.abs(real - target);
    const ok = isFinite(real) && diff <= TOLERANCE;
    verifyEl.innerHTML =
      `長度 <b>${isFinite(real) ? real.toFixed(2) : '?'} 秒</b>（目標 ${target} 秒，差 ${isFinite(real) ? diff.toFixed(2) : '?'} 秒）` +
      `${ok ? '' : ' <span style="color:#fbbf24">⚠ 秒數沒對上</span>'}<br>` +
      `${W}×${H}　${(blob.size / 1024 / 1024).toFixed(1)} MB　耗時 ${Math.round((Date.now() - t0) / 1000)} 秒` +
      (cardCount ? `<br>字幕 ${cardCount} 張` : '');
    if (srtBlob) {
      dlSrt.style.display = 'block';
      dlSrt.onclick = () => saveFile(srtBlob, `字幕_${Math.round(target)}秒.srt`);
    } else {
      dlSrt.style.display = 'none';
    }
    doneEl.style.display = 'block';
    progWrap.style.display = 'none';
    doneEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 清掉虛擬硬碟，免得連續做幾支就爆記憶體
    for (const n of [...names, 'merged.mp4', 'trimmed.mp4', 'out.mp4', 'final.mp4', 'sub.ass']) { try { await ffmpeg.deleteFile(n); } catch {} }

  } catch (e) {
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
