param([Parameter(Mandatory=$true)][string]$ImagePath,[double]$Scale=1)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Storage.FileAccessMode,Windows.Storage,ContentType=WindowsRuntime]
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
$stream=$null
try{
 $ImagePath=(Resolve-Path -LiteralPath $ImagePath).ProviderPath.Replace('/','\')
 $file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
 $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
 $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
 if($Scale -ne 1){
  $transform=[Windows.Graphics.Imaging.BitmapTransform]::new()
  $transform.InterpolationMode=[Windows.Graphics.Imaging.BitmapInterpolationMode]::NearestNeighbor
  $transform.ScaledWidth=[uint32]($decoder.PixelWidth*$Scale)
  $transform.ScaledHeight=[uint32]($decoder.PixelHeight*$Scale)
  $bitmap=Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied,$transform,[Windows.Graphics.Imaging.ExifOrientationMode]::IgnoreExifOrientation,[Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
 }else{$bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])}
 $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('ja'))
 if(!$engine){throw 'OCR_LANGUAGE_UNAVAILABLE'}
 $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
 $lines=@($result.Lines | ForEach-Object {
  $left=[double]::PositiveInfinity;$top=[double]::PositiveInfinity;$right=0;$bottom=0
  foreach($word in $_.Words){$b=$word.BoundingRect;$left=[Math]::Min($left,$b.X);$top=[Math]::Min($top,$b.Y);$right=[Math]::Max($right,$b.X+$b.Width);$bottom=[Math]::Max($bottom,$b.Y+$b.Height)}
  @{text=$_.Text;bbox=@{x0=$left/$Scale;y0=$top/$Scale;x1=$right/$Scale;y1=$bottom/$Scale}}
 })
 @{engine='Windows.Media.Ocr';language='ja';lines=$lines}|ConvertTo-Json -Depth 8 -Compress
}catch{@{error='WINDOWS_OCR_FAILED';exceptionType=$_.Exception.GetType().FullName;line=$_.InvocationInfo.ScriptLineNumber;hresult=$_.Exception.HResult}|ConvertTo-Json -Compress;exit 1}
finally{if($stream){$stream.Dispose()}}
