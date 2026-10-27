# Re-hashes every precached file in renderer/sw.js so browsers pick up edited files.
# Run after changing any file in renderer/ that has a revision entry in sw.js.
$renderer = Join-Path $PSScriptRoot '..\renderer'
$swPath = Join-Path $renderer 'sw.js'
$sw = [IO.File]::ReadAllText($swPath)
$updated = [regex]::Replace($sw, '\{url:"([^"]+)",revision:"[0-9a-f]+"\}', {
    param($m)
    $file = Join-Path $renderer $m.Groups[1].Value
    if (-not (Test-Path $file)) { return $m.Value }
    $hash = (Get-FileHash $file -Algorithm MD5).Hash.ToLower()
    '{url:"' + $m.Groups[1].Value + '",revision:"' + $hash + '"}'
})
[IO.File]::WriteAllText($swPath, $updated)
Write-Output 'sw.js revisions refreshed.'
