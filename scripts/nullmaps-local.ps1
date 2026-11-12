param([ValidateSet('Prepare','Build','Start','Stop','Status')][string]$Action='Status',[string]$WaterPolygonsUrl='https://ftp.uni-erlangen.de/pub/openstreetmapdata.com-archive/2026-10-18/water-polygons-split-3857.zip')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$repo=Join-Path $projectRoot '.tools/nullmaps'
$envFile=Join-Path $projectRoot '.env.local'
$compose=Join-Path $projectRoot 'infra/nullmaps.compose.yml'
$revision='9407cadde6b1eb89ffbeeeb9788a488d140671b9'
function Run-Native([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw "$Program failed (exit $LASTEXITCODE)."}}
function Download-IfMissing([string]$Url,[string]$Target){if(!(Test-Path -LiteralPath $Target)){Run-Native 'curl.exe' @('-fL','--retry','3','--output',"$Target.download",$Url);Move-Item -LiteralPath "$Target.download" -Destination $Target}}
if($Action -eq 'Prepare'){
 if(!(Test-Path -LiteralPath $repo)){Run-Native 'git' @('clone','https://github.com/tuantqse90/nullmaps.git',$repo)}
 $actual=(& git -C $repo rev-parse HEAD).Trim()
 if($actual -ne $revision){throw "Nullmaps checkout differs from reviewed revision $revision. Check the checkout before continuing."}
 foreach($folder in @('data/raw','data/fleet','ecoloop-style','services/tiles/fonts')){New-Item -ItemType Directory -Force -Path (Join-Path $repo $folder)|Out-Null}
 $style=Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $repo 'services/tiles/style/style.json')|ConvertFrom-Json
 # Terrain overlays are optional and not built by this lightweight local profile.
 foreach($name in @('hillshade','contours','terrain')){$style.sources.PSObject.Properties.Remove($name)}
 $style.layers=@($style.layers|Where-Object { !$_.source -or $_.source -notin @('hillshade','contours','terrain') })
 [IO.File]::WriteAllText((Join-Path $repo 'ecoloop-style/style.json'),($style|ConvertTo-Json -Depth 100),[Text.UTF8Encoding]::new($false))
 $contents=if(Test-Path -LiteralPath $envFile){Get-Content -Raw -LiteralPath $envFile}else{''}
 if($contents -notmatch '(?m)^NULLMAPS_URL='){$contents+="`nNULLMAPS_URL=http://127.0.0.1:8088`n"}
 if($contents -notmatch '(?m)^NULLMAPS_API_KEY=.+$'){
  $bytes=New-Object byte[] 32;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
  $key=[Convert]::ToBase64String($bytes)
  $contents=[regex]::Replace($contents,'(?m)^NULLMAPS_API_KEY=.*\r?\n?','')+"`nNULLMAPS_API_KEY=$key`n"
 }
 [IO.File]::WriteAllText($envFile,$contents,[Text.UTF8Encoding]::new($false))
 Write-Output 'Prepared local style and server-only key in ignored .env.local. No map data downloaded.'
 exit
}
if(!(Test-Path -LiteralPath $envFile)){throw 'Run -Action Prepare first.'}
Run-Native 'docker' @('info','--format','{{.ServerVersion}}')
$composeArgs=@('compose','--env-file',$envFile,'-f',$compose)
switch($Action){
 'Build'{
  $data=Join-Path $repo 'data';$fonts=Join-Path $repo 'services/tiles/fonts'
  Download-IfMissing 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf' (Join-Path $data 'raw/vietnam-latest.osm.pbf')
  foreach($weight in @('Regular','Bold')){Download-IfMissing "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-$weight.ttf" (Join-Path $fonts "NotoSans-$weight.ttf")}
  if(!(Test-Path (Join-Path $data 'vietnam.pmtiles'))){Run-Native 'docker' @('run','--rm','-v',"${data}:/data",'ghcr.io/onthegomap/planetiler:latest','--osm-path=/data/raw/vietnam-latest.osm.pbf',"--water-polygons-url=$WaterPolygonsUrl",'--download','--tmpdir=/tmp/planetiler','--maxzoom=16','--output=/data/vietnam.building.pmtiles','--force');Move-Item -LiteralPath (Join-Path $data 'vietnam.building.pmtiles') -Destination (Join-Path $data 'vietnam.pmtiles')}
  Run-Native 'docker' ($composeArgs+@('build','geocoder','adapter'))
  if(!(Test-Path (Join-Path $data 'geocoder.db'))){Run-Native 'docker' @('run','--rm','-v',"${data}:/data",'ecoloop-nullmaps-geocoder','python','importer.py','/data/raw/vietnam-latest.osm.pbf','/data/geocoder.building.db');Move-Item -LiteralPath (Join-Path $data 'geocoder.building.db') -Destination (Join-Path $data 'geocoder.db')}
 }
 'Start'{if(!(Test-Path (Join-Path $repo 'data/vietnam.pmtiles'))-or !(Test-Path (Join-Path $repo 'data/geocoder.db'))){throw 'Data missing. Run -Action Build first.'};Run-Native 'docker' ($composeArgs+@('up','-d'))}
 'Stop'{Run-Native 'docker' ($composeArgs+@('stop'))}
 'Status'{Run-Native 'docker' ($composeArgs+@('ps'))}
}
