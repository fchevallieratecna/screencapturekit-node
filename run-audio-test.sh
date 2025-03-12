#!/bin/bash
set -e

echo "🔧 Compilation du code Swift..."
swift build

echo ""
echo "🏃 Exécution du test d'enregistrement audio..."
swift run --skip-build audio-capture-test

echo ""
echo "🔍 Si l'enregistrement a réussi, vérifiez le fichier: /tmp/audio-capture-test.mp4" 