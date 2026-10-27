param([string]$Root='reports/persona-svgomg-live-2026-10-26')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$results=Get-Content -LiteralPath (Join-Path $Root 'results.json') -Raw | ConvertFrom-Json
$audit=@()
foreach($run in $results){
 $zip=[System.IO.Compression.ZipFile]::OpenRead((Join-Path (Resolve-Path $Root) ($run.dir+'/trace.zip')))
 $calls=@{};$failures=@()
 try{foreach($entry in $zip.Entries){if($entry.FullName -notmatch '\.trace$'){continue};$reader=[System.IO.StreamReader]::new($entry.Open());try{$lines=$reader.ReadToEnd() -split "`n"}finally{$reader.Dispose()};foreach($line in $lines){if(!$line){continue};$event=$line|ConvertFrom-Json;if($event.type -eq 'before'){$calls[$event.callId]=@{class=$event.class;method=$event.method;waitUntil=$event.params.waitUntil;timeout=$event.params.timeout}};if($event.type -eq 'after' -and $event.error){$call=$calls[$event.callId];$failures+=@{class=$call.class;method=$call.method;waitUntil=$call.waitUntil;timeout=$call.timeout;errorName=if($event.error.message -match '^Timeout'){'TIMEOUT'}else{'BROWSER_CALL_ERROR'}}}}}
 }finally{$zip.Dispose()}
 $audit+=@{condition=$run.condition;repeat=$run.repeat;dir=$run.dir;failures=$failures}
}
ConvertTo-Json -InputObject @($audit) -Depth 8 | Set-Content -LiteralPath (Join-Path $Root 'trace-audit.json')
Write-Output "Audited $($audit.Count) traces."
