// 跨來源隔離（多執行緒用的）—— 目前停用中。
//
// 多執行緒實測會卡死（一分鐘的素材跑 11 分鐘沒結束），所以關掉了。
// 既然用不到，service worker 也不該留在使用者的瀏覽器裡 ——
// 這支現在只負責把之前裝過的那一份清掉。
//
// 要重新啟用的話：把這支還原成註冊版本（git 歷史裡有），
// 並把 app.js 的 MT_ENABLED 改回 true。
// ⚠ 重啟前一定要先用一分鐘以上的真實素材在開發環境跑過，不要再直接上線。

if (typeof window !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => {
      if (!regs.length) return;
      console.log('[coi] 多執行緒已停用，清掉之前註冊的 service worker');
      return Promise.all(regs.map(r => r.unregister()));
    })
    .then(() => { try { sessionStorage.removeItem('coi-reloaded'); } catch {} })
    .catch(err => console.warn('[coi] 清理時出錯（不影響使用）：', err));
}
