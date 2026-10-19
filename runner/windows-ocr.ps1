# A local pixel-only helper. No paths, network calls, or model credentials.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.DataWriter,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrResult,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1} | Select-Object -First 1
function Await($Operation,[Type]$ResultType){
 $task=$asTask.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
 return $task.GetAwaiter().GetResult()
}
$stream=$null;$writer=$null;$bitmap=$null
try{
 $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ja'))
 if(!$engine){Write-Output '{"status":"unavailable","lines":[]}';exit 0}
 $bytes=[Convert]::FromBase64String([Console]::ReadLine())
 $stream=[Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
 $writer=[Windows.Storage.Streams.DataWriter]::new($stream)
 $writer.WriteBytes($bytes)
 $null=Await ($writer.StoreAsync()) ([uint32])
 $null=$writer.DetachStream();$writer.Dispose();$writer=$null
 $stream.Seek(0)
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
 $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
 $lines=@($result.Lines | ForEach-Object {
  $left=[double]::PositiveInfinity;$top=[double]::PositiveInfinity;$right=0;$bottom=0
  foreach($word in $_.Words){$b=$word.BoundingRect;$left=[Math]::Min($left,$b.X);$top=[Math]::Min($top,$b.Y);$right=[Math]::Max($right,$b.X+$b.Width);$bottom=[Math]::Max($bottom,$b.Y+$b.Height)}
  @{text=$_.Text;bbox=@{x0=$left;y0=$top;x1=$right;y1=$bottom}}
 })
 @{status='ready';lines=$lines}|ConvertTo-Json -Depth 8 -Compress
}catch{Write-Output '{"status":"error","lines":[]}';exit 1}
finally{if($writer){$writer.Dispose()};if($bitmap){$bitmap.Dispose()};if($stream){$stream.Dispose()}}
