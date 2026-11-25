param(
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments
)
& (Join-Path $PSScriptRoot 'install.ps1') -Mode Uninstall @Arguments
exit $LASTEXITCODE
