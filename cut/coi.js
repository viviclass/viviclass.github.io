// 跨來源隔離（多執行緒用的）—— 目前停用中。
//
// 多執行緒實測會卡死（一分鐘的素材跑 11 分鐘沒結束），所以關掉了。
// 既然用不到，service worker 也不該留在使用者的瀏覽器裡 ——
// 這支現在只負責把之前裝過的那一份清掉。
//
// ⚠ unregister() 只是「標記移除」，目前這一頁仍然由舊的那份 service worker
//   控制著，它的 fetch handler 會把每個回應重新包一層 ——32 MB 的 wasm
//   就卡在那裡下載不完。所以清掉之後一定要重整一次才真的擺脫它。
//
// 要重新啟用多執行緒的話：把這支還原成註冊版本（git 歷史裡有），
// 並把 app.js 的 MT_ENABLED 改回 true。
// ⚠ 重啟前一定要先用一分鐘以上的真實素材在開發環境跑過，不要再直接上線。

(function () {
  if (typeof window === 'undefined' || !navigator.serviceWorker) return;
  var sw = navigator.serviceWorker;
  var KEY = 'coi-cleaned';

  sw.getRegistrations().then(function (regs) {
    if (!regs.length) return null;
    console.log('[coi] 多執行緒已停用，清掉之前註冊的 service worker');
    return Promise.all(regs.map(function (r) { return r.unregister(); }));
  }).then(function (done) {
    if (!done) return;
    try { sessionStorage.removeItem('coi-reloaded'); } catch (e) {}
    // 還被舊的控制著就重整一次（用旗標擋住無限重整）
    if (sw.controller) {
      var already = false;
      try { already = !!sessionStorage.getItem(KEY); } catch (e) {}
      if (!already) {
        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
        console.log('[coi] 重新整理以擺脫舊的 service worker');
        window.location.reload();
      }
    }
  }).catch(function (err) {
    console.warn('[coi] 清理時出錯（不影響使用）：', err);
  });
})();
