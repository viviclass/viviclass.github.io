$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\James\vivi-website'
$log = Join-Path $repo 'publish-chatgpt2026-log.txt'

try { Start-Transcript -Path $log -Force | Out-Null } catch {}

try {
    Write-Host ''
    Write-Host '=== 薇光AI課堂 官網上傳：ChatGPT 2026 懶人包 ===' -ForegroundColor Magenta
    Write-Host ''

    Set-Location $repo

    Write-Host '[1/3] 存檔中...' -ForegroundColor Cyan
    git add -A

    $pending = git status --porcelain
    if ([string]::IsNullOrWhiteSpace($pending)) {
        Write-Host '      沒有新的變更，跳過存檔。' -ForegroundColor DarkGray
    } else {
        $commitMsg = @"
新增 chatgpt-2026 懶人包：ChatGPT 2026 最新升級實戰整理

- 新增 /chatgpt-2026/ 頁面：GPT-6 Astra、圖像2.5、Work、Google/Projects、
  Voice/貼圖等 2026年9月更新的查證整理，含方案對照表、排查步驟、
  7組可複製指令、FAQ（含結構化資料）
- 首頁教學懶人包補 NO.05
- /free/ 總表補一列
- 根目錄 sitemap.xml 補 chatgpt-2026 條目
- 根目錄 llms.txt 補內容摘要與 FAQ 區塊

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y4ypLLhJuBwEaMEK7JrUpw
"@
        git commit -m $commitMsg
        Write-Host '      存檔完成。' -ForegroundColor Green
    }

    Write-Host ''
    Write-Host '[2/3] 上傳到 GitHub...' -ForegroundColor Cyan
    Write-Host '      (如果跳出登入視窗，請自己輸入帳號密碼)' -ForegroundColor DarkGray
    git push origin HEAD
    Write-Host '      上傳完成。' -ForegroundColor Green

    Write-Host ''
    Write-Host '[3/3] 等 GitHub 重建網站，最多等 2 分鐘...' -ForegroundColor Cyan
    $url = 'https://viviclass.github.io/chatgpt-2026/'
    $ok = $false
    for ($i = 1; $i -le 12; $i++) {
        Start-Sleep -Seconds 10
        try {
            $code = (Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop).StatusCode
        } catch {
            $code = 0
        }
        if ($code -eq 200) { $ok = $true; break }
        Write-Host ("      還在蓋... ({0}0 秒)" -f $i) -ForegroundColor DarkGray
    }

    Write-Host ''
    if ($ok) {
        Write-Host '=== 完成！網頁已經上線 ===' -ForegroundColor Green
        Write-Host ''
        Write-Host $url -ForegroundColor Magenta
        Write-Host ''
        Write-Host '3 秒後自動幫妳打開...' -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
        Start-Process $url
    } else {
        Write-Host '檔案已經上傳成功，但網站還在重建。' -ForegroundColor Yellow
        Write-Host '再等幾分鐘後自己開這個網址就會看到：' -ForegroundColor Yellow
        Write-Host ''
        Write-Host $url -ForegroundColor Magenta
    }
}
catch {
    Write-Host ''
    Write-Host '✗ 發生錯誤，完整訊息如下（請截圖或複製給 Claude）：' -ForegroundColor Red
    Write-Host ''
    Write-Host ($_ | Out-String) -ForegroundColor Red
    Write-Host ($_.ScriptStackTrace | Out-String) -ForegroundColor Red
}
finally {
    try { Stop-Transcript | Out-Null } catch {}
    Write-Host ''
    Write-Host ("完整紀錄已存到：" + $log) -ForegroundColor DarkGray
    Write-Host ''
    Read-Host '按 Enter 關閉這個視窗（這次視窗不會自動關掉，請放心）'
}
