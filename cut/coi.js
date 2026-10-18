// 讓 GitHub Pages 也能開啟「跨來源隔離」。
//
// 多執行緒的 ffmpeg 需要 SharedArrayBuffer，而那要求網頁帶著
// Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy 兩個標頭。
// GitHub Pages 不能自訂標頭，所以改用 service worker 在本地補上。
//
// 用 credentialless 而不是 require-corp：require-corp 會擋掉所有沒送 CORP
// 標頭的跨來源資源，字幕模型放在 HuggingFace 上就是這種，整個功能會壞掉。
// credentialless 不要求對方送標頭（改成不帶 cookie 請求），實測兩邊都載得到。
// Safari 不支援 credentialless，那裡就不會有隔離，程式會自動退回單執行緒。
//
// 安全性：
//  * 這支檔案放在 /cut/ 底下，service worker 的管轄範圍就只有 /cut/，
//    網站上其他頁面完全不受影響。
//  * 轉送失敗一律回傳原始 response，不會因為加標頭失敗就讓網頁打不開。
//  * 註冊失敗只會在 console 留個訊息，程式自動用單執行緒跑（跟以前一樣）。
//  * 網址加上 ?nocoi=1 可以把它解除安裝。

const FLAG = 'nocoi';

if (typeof window === 'undefined') {
  // ================= 在 service worker 裡 =================
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    // 只處理一般的網頁資源請求
    if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
    e.respondWith((async () => {
      const res = await fetch(e.request);
      try {
        if (res.status === 0 || res.type === 'opaque') return res;   // 這種不能改
        const h = new Headers(res.headers);
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        h.set('Cross-Origin-Embedder-Policy', 'credentialless');
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
      } catch (err) {
        // 加標頭出了任何問題，就原封不動送回去 —— 寧可沒有隔離，也不要讓頁面打不開
        console.warn('[coi] 加標頭失敗，改送原始回應', err);
        return res;
      }
    })());
  });
} else {
  // ================= 在頁面裡 =================
  const sw = navigator.serviceWorker;

  if (new URLSearchParams(location.search).has(FLAG)) {
    // 逃生門：?nocoi=1 解除安裝，之後就一直用單執行緒
    window.__coi = '已關閉（網址有 nocoi）';
    sw?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister()))
      .then(() => { sessionStorage.removeItem('coi-reloaded'); console.log('[coi] 已解除安裝'); });
  } else if (window.crossOriginIsolated) {
    window.__coi = '已啟用';
    sessionStorage.removeItem('coi-reloaded');
    console.log('[coi] 已經是隔離狀態，可以用多執行緒');
  } else if (sw && window.isSecureContext) {
    window.__coi = '註冊中';
    (async () => {
      try {
        await sw.register('coi.js', { scope: './' });   // 相對於這一頁，等於 /cut/coi.js
        // ⚠ 不能只看 reg.active —— 剛註冊時它可能還在 installing，
        //   等 ready 才保證有 active 的那一份，不然會錯過重整的時機。
        await sw.ready;
        if (!sw.controller) {
          // 這一份頁面還沒被 service worker 管到，重整一次才會帶上標頭。
          // 用 sessionStorage 擋住無限重整（萬一標頭還是沒生效）。
          if (!sessionStorage.getItem('coi-reloaded')) {
            sessionStorage.setItem('coi-reloaded', '1');
            console.log('[coi] 已註冊，重新整理以套用');
            window.location.reload();
          } else {
            window.__coi = '重整後仍未生效';
            console.warn('[coi] 重整過一次還是沒有隔離，用單執行緒跑');
          }
        }
      } catch (err) {
        // 把原因寫進標籤，不然只能叫人去開 console
        const why = String(err && err.message || err)
          .replace(/^Failed to register a ServiceWorker.*?\)\s*:\s*/, '')
          .slice(0, 90);
        window.__coi = '註冊失敗：' + why;
        console.warn('[coi] 註冊失敗，會用單執行緒跑（功能正常，只是慢一點）：', err);
      }
    })();
    sw.addEventListener('controllerchange', () => {
      if (!sessionStorage.getItem('coi-reloaded')) {
        sessionStorage.setItem('coi-reloaded', '1');
        window.location.reload();
      }
    });
  } else {
    window.__coi = sw ? '不是安全連線' : '瀏覽器不支援';
    console.log('[coi] 這個瀏覽器不支援，會用單執行緒跑');
  }
}
