# Generate a self-signed certificate into certs/ for LAN HTTPS serving.
#
# The certificate SAN(subjectAltName) MUST include the PC's LAN IP, otherwise
# phone browsers reject it and camera/compass will not work. When -IpAddresses
# is omitted, LAN IPv4 addresses are auto-detected.
# openssl is NOT required on the host (uses the alpine/openssl Docker image).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/gen-local-cert.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/gen-local-cert.ps1 -IpAddresses 192.168.1.50

param([string[]]$IpAddresses)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null

if (-not $IpAddresses -or $IpAddresses.Count -eq 0) {
    $IpAddresses = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
}

if (-not $IpAddresses -or $IpAddresses.Count -eq 0) {
    Write-Error "Could not detect a LAN IP. Pass it explicitly, e.g. -IpAddresses 192.168.1.50"
    exit 1
}

Write-Host "SAN IP addresses: $($IpAddresses -join ', ')"

$san = "DNS:localhost,IP:127.0.0.1"
foreach ($ip in $IpAddresses) { $san += ",IP:$ip" }

# alpine/openssl has ENTRYPOINT=openssl, so pass args starting from 'req'
docker run --rm -v "${certDir}:/certs" alpine/openssl `
    req -x509 -newkey rsa:2048 -nodes `
    -keyout /certs/server.key -out /certs/server.crt -days 365 `
    -subj "/CN=oc-navigation-local" `
    -addext "subjectAltName=$san"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Certificate generation failed (is Docker running?)"
    exit 1
}

Write-Host ""
Write-Host "Done:"
Write-Host "  $certDir\server.crt"
Write-Host "  $certDir\server.key"
Write-Host ""
Write-Host "Next: docker compose -f docker-compose.yml -f docker-compose.https.yml up --build"
Write-Host "On phone open: https://$($IpAddresses[0])"
