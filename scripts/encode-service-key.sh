#!/usr/bin/env bash
# Gera o base64 da service account key pra colar no GitHub Secret
# Uso: bash scripts/encode-service-key.sh
cat serviceAccountKey.json | base64
