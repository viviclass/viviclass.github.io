$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\James\vivi-website'

Write-Host ''
Write-Host '=== 薇光AI課堂 官網上傳 ===' -ForegroundColor Magenta
Write-Host ''

Set-Location $repo

# --- 第一步：存檔 ---
Write-Host '[1/3] 存檔中...' -ForegroundColor Cyan
git add -A

$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pending)) {
    Write-Host '      沒有新的變更，跳過存檔。' -ForegroundColor DarkGray
} else {
    git commit -m "新增子頁：Notion × AI 提示詞資產庫教學懶人包"
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host '✗ 存檔失敗。請把上面的訊息複製給 Claude。' -ForegroundColor Red
        Read-Host '按 Enter 關閉'
        exit 1
    }
    Write-Host '      存檔完成。' -ForegroundColor Green
}

# --- 第二步：送上 GitHub ---
Write-Host ''
Write-Host '[2/3] 上傳到 GitHub...' -ForegroundColor Cyan
Write-Host '      (如果跳出登入視窗，請自己輸入帳號密碼)' -ForegroundColor DarkGray
git push origin HEAD
if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '✗ 上傳失敗。請把上面的訊息複製給 Claude。' -ForegroundColor Red
    Read-Host '按 Enter 關閉'
    exit 1
}
Write-Host '      上傳完成。' -ForegroundColor Green

# --- 第三步：等 GitHub 重建，然後檢查網址 ---
Write-Host ''
Write-Host '[3/3] 等 GitHub 重建網站，最多等 2 分鐘...' -ForegroundColor Cyan

$url = 'https://viviclass.github.io/notion-ai-vault/'
$ok = $false
for ($i = 1; $i -le 12; $i++) {
    Start-Sleep -Seconds 10
    try {
        $code = (Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 15 -ErrorAction Stop).StatusCode
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

Write-Host ''
Read-Host '按 Enter 關閉這個視窗'
