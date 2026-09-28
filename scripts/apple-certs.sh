#!/usr/bin/env bash
# =============================================================================
# Apple Wallet certificates helper (works in Git Bash on Windows, macOS, Linux).
#
#   bash scripts/apple-certs.sh csr  tu@email.com   # 1. private key + CSR to upload to Apple
#   bash scripts/apple-certs.sh env                 # 3. PEMs + base64 lines for .env.local / Vercel
#
# Between steps 1 and 3 (see docs/SETUP.md › Apple Wallet):
#   2. Upload certs/pass.csr in developer.apple.com → your Pass Type ID → Create Certificate,
#      download it as certs/pass.cer, and download Apple's WWDR G4 intermediate as
#      certs/AppleWWDRCAG4.cer (https://www.apple.com/certificateauthority/).
#
# Everything lives in ./certs, which is git-ignored. Never commit these files.
# =============================================================================
set -euo pipefail

DIR="certs"
mkdir -p "$DIR"

b64() {
  # Single-line base64, portable across GNU/BSD/Git Bash.
  base64 < "$1" | tr -d '\r\n'
}

case "${1:-}" in
  csr)
    EMAIL="${2:-}"
    if [[ -z "$EMAIL" ]]; then
      echo "Uso: bash scripts/apple-certs.sh csr tu@email.com" >&2
      exit 1
    fi
    if [[ -f "$DIR/pass.key" ]]; then
      echo "Ya existe $DIR/pass.key — no lo sobrescribo. Bórralo a mano si quieres empezar de cero." >&2
      exit 1
    fi
    openssl genrsa -out "$DIR/pass.key" 2048
    # MSYS_NO_PATHCONV stops Git Bash from mangling the "/emailAddress=..." subject.
    MSYS_NO_PATHCONV=1 openssl req -new -key "$DIR/pass.key" -out "$DIR/pass.csr" \
      -subj "/emailAddress=${EMAIL}/CN=PassMe Pass Type ID/C=ES"
    echo
    echo "✔ Creado $DIR/pass.key (privada, NO la compartas) y $DIR/pass.csr"
    echo "→ Sube $DIR/pass.csr en Apple Developer y guarda el certificado como $DIR/pass.cer"
    ;;

  env)
    for f in pass.key pass.cer AppleWWDRCAG4.cer; do
      if [[ ! -f "$DIR/$f" ]]; then
        echo "Falta $DIR/$f (mira docs/SETUP.md › Apple Wallet)" >&2
        exit 1
      fi
    done
    openssl x509 -inform DER -in "$DIR/pass.cer" -out "$DIR/pass.pem"
    openssl x509 -inform DER -in "$DIR/AppleWWDRCAG4.cer" -out "$DIR/wwdr.pem"

    # Sanity check: the certificate must match the private key.
    CERT_MOD=$(openssl x509 -noout -modulus -in "$DIR/pass.pem" | openssl sha256)
    KEY_MOD=$(openssl rsa -noout -modulus -in "$DIR/pass.key" | openssl sha256)
    if [[ "$CERT_MOD" != "$KEY_MOD" ]]; then
      echo "✖ pass.cer no corresponde a pass.key. ¿Subiste el CSR generado con esta clave?" >&2
      exit 1
    fi

    SUBJECT=$(openssl x509 -noout -subject -in "$DIR/pass.pem")
    PASS_TYPE_ID=$(echo "$SUBJECT" | sed -n 's/.*UID *= *\([^,/]*\).*/\1/p')
    TEAM_ID=$(echo "$SUBJECT" | sed -n 's/.*OU *= *\([^,/]*\).*/\1/p')

    echo "✔ Certificado y clave coinciden."
    echo "# ---- Pega esto en .env.local y en Vercel ----"
    [[ -n "$PASS_TYPE_ID" ]] && echo "APPLE_PASS_TYPE_ID=$PASS_TYPE_ID"
    [[ -n "$TEAM_ID" ]] && echo "APPLE_TEAM_ID=$TEAM_ID"
    echo "APPLE_PASS_CERT=$(b64 "$DIR/pass.pem")"
    echo "APPLE_PASS_KEY=$(b64 "$DIR/pass.key")"
    echo "APPLE_WWDR_CERT=$(b64 "$DIR/wwdr.pem")"
    ;;

  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
