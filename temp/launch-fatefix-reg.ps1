# 提取合同升级(agent 化重构)20 章真实回归启动器
# 验证目标:命运宣告(死亡/驾崩/下狱/去职,含一句带过)全部入账 chapterMemories,
#           台账驱动 triage 候选可命中;工程质量不劣化(exit 0 / 首过率 / 读者分)
$ErrorActionPreference = 'Stop'
Set-Location 'D:\project\2026\moliu'

Set-Item -Path 'env:MOLIU_CHAPTER_COUNT' -Value '20'
Set-Item -Path 'env:MOLIU_AGENT_RESEARCH' -Value '1'
Set-Item -Path 'env:MOLIU_READER_JUDGE_PROVIDER_ID' -Value 'provider-1787039781123'
Set-Item -Path 'env:MOLIU_TEST_TIMEOUT_MIN' -Value '300'
Set-Item -Path 'env:MOLIU_STORYFLOW_RUN_SUFFIX' -Value 'agif20fatefix2'
Set-Item -Path 'env:MOLIU_STORYFLOW_MATRIX_DIR' -Value 'temp\storyflow-matrix-agif20fatefix2'

$outLog = 'D:\project\2026\moliu\temp\agif20fatefix2.launch.log'
$errLog = 'D:\project\2026\moliu\temp\agif20fatefix2.launch.err.log'
$p = Start-Process -FilePath 'node' `
  -ArgumentList 'scripts/agent-storyflow-real-multi.mjs', 'provider-1787039781123' `
  -WorkingDirectory 'D:\project\2026\moliu' `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru
Write-Output ("launched agif20fatefix2 pid=" + $p.Id)
