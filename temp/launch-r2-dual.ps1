# r2 双开 200 章可上线大循环启动器(分离进程防宿主回收,协议见 baseline-loop-channel-relay)
# 写作与读者裁判同通道:反重力-gemini-3.7-flash = provider-1787039781123 (127.0.0.1:8045)
$ErrorActionPreference = 'Stop'
Set-Location 'D:\project\2026\moliu'

$common = @{
  'MOLIU_CHAPTER_COUNT'             = '200'
  'MOLIU_AGENT_RESEARCH'            = '1'
  'MOLIU_READER_JUDGE_PROVIDER_ID'  = 'provider-1787039781123'
  'MOLIU_TEST_TIMEOUT_MIN'          = '1500'
}

$slots = @(
  @{ suffix = 'agif200r2a'; dir = 'temp\storyflow-matrix-agif200r2a' },
  @{ suffix = 'agif200r2b'; dir = 'temp\storyflow-matrix-agif200r2b' }
)

foreach ($s in $slots) {
  foreach ($k in $common.Keys) { Set-Item -Path ("env:" + $k) -Value $common[$k] }
  Set-Item -Path 'env:MOLIU_STORYFLOW_RUN_SUFFIX' -Value $s.suffix
  Set-Item -Path 'env:MOLIU_STORYFLOW_MATRIX_DIR' -Value $s.dir

  $outLog = Join-Path 'D:\project\2026\moliu\temp' ($s.suffix + '.launch.log')
  $errLog = Join-Path 'D:\project\2026\moliu\temp' ($s.suffix + '.launch.err.log')
  $p = Start-Process -FilePath 'node' `
    -ArgumentList 'scripts/agent-storyflow-real-multi.mjs', 'provider-1787039781123' `
    -WorkingDirectory 'D:\project\2026\moliu' `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru
  Write-Output ("launched " + $s.suffix + " pid=" + $p.Id + " log=" + $outLog)
}
