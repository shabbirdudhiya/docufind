$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=DocuFind" -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -Provider "Microsoft Enhanced RSA and AES Cryptographic Provider" -CertStoreLocation "Cert:\CurrentUser\My"
$password = ConvertTo-SecureString -String "password123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "cert.pfx" -Password $password
Write-Host "Certificate generated at cert.pfx"
