// 字幕：語音辨識 → 繁體化 → 斷句 → 產生 ASS
import { normalize, tidyPunct } from './s2t.js';

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

// 模型選擇。實測（30 秒中文音訊，8 核心電腦）：
//   base  → 18.6 秒（0.62 倍實時）
//   small → 59.1 秒（1.97 倍實時），品質只是互有勝負
// 所以預設 base。
export const MODELS = {
  base:  { id: 'onnx-community/whisper-base',  label: '一般（快）',   mb: 80,  rate: 0.62 },
  small: { id: 'onnx-community/whisper-small', label: '較準（慢 3 倍）', mb: 240, rate: 1.97 },
};

let _asr = null, _asrKey = '';

/** 載入辨識模型（同一個模型只會載一次） */
export async function loadASR(which = 'base', onProgress) {
  if (_asr && _asrKey === which) return _asr;
  const T = await import(TRANSFORMERS);
  _asr = await T.pipeline('automatic-speech-recognition', MODELS[which].id, {
    dtype: 'q8',
    progress_callback: p => {
      if (onProgress && p.status === 'progress' && p.progress) onProgress(p.progress / 100, p.file);
    },
  });
  _asrKey = which;
  return _asr;
}

/** 從影片抽出 16kHz 單聲道 wav，餵給辨識用 */
export async function extractAudio(ffmpeg, inName) {
  await ffmpeg.exec(['-i', inName, '-vn', '-ar', '16000', '-ac', '1', '-f', 'wav', '_asr.wav']);
  const d = await ffmpeg.readFile('_asr.wav');
  const blob = new Blob([d.buffer], { type: 'audio/wav' });
  try { await ffmpeg.deleteFile('_asr.wav'); } catch {}
  return URL.createObjectURL(blob);
}

/** 辨識，回傳 [{start, end, text}] */
export async function transcribe(asr, audioURL, { onProgress } = {}) {
  const out = await asr(audioURL, {
    language: 'chinese', task: 'transcribe',
    return_timestamps: true, chunk_length_s: 30, stride_length_s: 5,
  });
  URL.revokeObjectURL(audioURL);
  const chunks = (out.chunks || []).filter(c => c.text && c.text.trim());
  if (!chunks.length && out.text) return [{ start: 0, end: 0, text: out.text.trim() }];
  return chunks.map(c => ({
    start: c.timestamp?.[0] ?? 0,
    end:   c.timestamp?.[1] ?? null,
    text:  (c.text || '').trim(),
  }));
}

// 不可以拆開的詞 —— 斷行時遇到這些要整組留在同一行
const NO_SPLIT = ['蝦皮','分潤','影片','字幕','短影音','提示詞','智能體','演算法','社群',
                  '限時動態','流量','變現','轉換率','關鍵字','自媒體','行銷','電商'];

/** 把一段文字切成多張字幕卡，時間按字數比例分配 */
function splitCard(start, end, text, maxChars) {
  const clean = tidyPunct(normalize(text));
  if (!clean) return [];
  if (clean.length <= maxChars) return [{ start, end, text: clean }];

  // 優先在標點切，其次找不會切斷詞的位置
  const cards = [];
  let rest = clean;
  while (rest.length > maxChars) {
    let cut = -1;
    // 1. 在 maxChars 範圍內找最後一個標點
    for (let i = Math.min(maxChars, rest.length - 1); i >= Math.floor(maxChars * 0.5); i--) {
      if ('，、。；！？'.includes(rest[i])) { cut = i + 1; break; }
    }
    // 2. 沒標點就用 maxChars，但要避開不可拆的詞
    if (cut < 0) {
      cut = maxChars;
      for (const w of NO_SPLIT) {
        const p = rest.indexOf(w);
        if (p >= 0 && p < cut && p + w.length > cut) { cut = p; break; }
      }
      if (cut < 2) cut = maxChars;
    }
    cards.push(rest.slice(0, cut).replace(/[，、]$/, ''));
    rest = rest.slice(cut);
  }
  if (rest) cards.push(rest);
  // 最後一張只剩一兩個字很突兀 → 跟前一張平均分
  if (cards.length >= 2 && cards[cards.length - 1].length < 3) {
    const comb = cards[cards.length - 2] + cards[cards.length - 1];
    const mid = Math.ceil(comb.length / 2);
    cards[cards.length - 2] = comb.slice(0, mid);
    cards[cards.length - 1] = comb.slice(mid);
  }

  // 時間按字數比例切
  const total = cards.reduce((s, c) => s + c.length, 0);
  const span = (end ?? start + total * 0.25) - start;
  let acc = 0;
  return cards.map(c => {
    const s = start + span * (acc / total);
    acc += c.length;
    return { start: s, end: start + span * (acc / total), text: c };
  }).filter(c => c.text);
}

/** 把辨識結果整理成字幕卡 */
export function buildCards(segments, { maxChars = 18, totalDur = 0 } = {}) {
  const cards = [];
  segments.forEach((seg, i) => {
    let end = seg.end;
    if (end == null || end <= seg.start) {
      const next = segments[i + 1];
      end = next ? next.start : (totalDur || seg.start + seg.text.length * 0.25);
    }
    cards.push(...splitCard(seg.start, end, seg.text, maxChars));
  });
  // 首尾相接的字卡在 ASS 只有百分秒精度，會憑空重疊 → 把前一張收早一點點
  for (let i = 0; i < cards.length - 1; i++) {
    if (cards[i].end > cards[i + 1].start - 0.02) cards[i].end = Math.max(cards[i].start + 0.3, cards[i + 1].start - 0.02);
  }
  return cards.filter(c => c.end > c.start && c.text);
}

const t2a = t => {
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

/** 產生 ASS。字一律釘死在 \pos —— libass 的碰撞閃避會把時間有交集的字卡整張往上疊。 */
export function toASS(cards, { W, H, portrait }) {
  const fontSize = portrait ? 96 : 108;    // 比舊版大 1.5 倍。ASS 字號是「行高」，思源黑體實際字寬約 0.7 倍字號：橫式 18 字約 1350px（<1920），直式 14 字約 925px（<1080），所以 maxChars 不用跟著減
  const marginV  = portrait ? 170 : 80;
  const outline  = portrait ? 5 : 6;
  const posY = H - marginV;
  const head =
`[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans TC,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${outline},0,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const body = cards.map(c =>
    `Dialogue: 0,${t2a(c.start)},${t2a(c.end)},Default,,0,0,0,,{\\an2\\pos(${Math.round(W / 2)},${posY})}${c.text.replace(/\n/g, ' ')}`
  ).join('\n');
  return head + body + '\n';
}

/** 順便給學員一份 SRT，拿去 YouTube 或剪映都能用 */
export function toSRT(cards) {
  const t = s => {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = Math.floor(s % 60),
          ms = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  };
  return cards.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join('\n');
}
