$ErrorActionPreference = 'SilentlyContinue'
# Search common roots for node.exe, depth 4
$roots = @('C:\Program Files','C:\Program Files (x86)','D:\Program Files','D:\','C:\Users\许保良\AppData\Local','C:\Users\许保良\AppData\Roaming\nvm','C:\nvm4w','D:\nvm4w')
$hits = @()
foreach ($r in $roots) {
  if (Test-Path $r) {
    $found = Get-ChildItem -Path $r -Filter 'node.exe' -Recurse -Depth 4 -ErrorAction SilentlyContinue
    foreach ($f in $found) { $hits += $f.FullName }
  }
}
$hits | Sort-Object -Unique | ForEach-Object { Write-Output $_ }
