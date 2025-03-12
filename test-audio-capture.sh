#!/bin/bash
set -e

# Définir le chemin vers le binaire compilé
SCREENCAPTUREKIT_BIN="./dist/screencapturekit"
CACHE_FILE="/tmp/screencapturekit-ids.cache"

# Vérifier si le binaire existe
if [ ! -f "$SCREENCAPTUREKIT_BIN" ]; then
    echo "⚠️ Binaire optimisé non trouvé dans ./dist. Vous devez d'abord exécuter 'npm run build-swift'"
    exit 1
fi

echo "🚀 Utilisation du binaire compilé: $SCREENCAPTUREKIT_BIN"
echo ""
echo "🎤 Exécution de la capture audio uniquement..."
echo "📂 Le fichier sera enregistré dans: /tmp/audio-capture.mp3"

# Vérifier si FFmpeg est installé
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️ FFmpeg n'est pas installé. L'étape de conversion audio ne sera pas possible."
    exit 1
fi

# Utiliser le cache si disponible et récent (moins de 1 heure)
if [ -f "$CACHE_FILE" ] && [ $(($(date +%s) - $(stat -f %m "$CACHE_FILE"))) -lt 3600 ]; then
    echo "🚀 Utilisation des identifiants en cache pour accélérer la recherche..."
    source "$CACHE_FILE"
    echo "✅ Identifiants chargés du cache: écran=$SCREEN_ID, audio=$AUDIO_ID, micro=$MIC_ID"
else
    echo "🔍 Recherche rapide des périphériques (sans affichage détaillé)..."
    
    # Récupérer l'identifiant du premier écran disponible
    SCREEN_ID=$("$SCREENCAPTUREKIT_BIN" list screens 2>/dev/null | grep "ID:" | head -1 | awk '{print $2}')
    
    # Rechercher le casque Bose pour le son système
    AUDIO_ID=$("$SCREENCAPTUREKIT_BIN" list audio 2>/dev/null | grep -i "bose" | grep -i "id:" | head -1 | awk '{print $2}')
    
    # Rechercher le casque Bose comme microphone
    MIC_ID=$("$SCREENCAPTUREKIT_BIN" list microphones 2>/dev/null | grep -i "bose" | grep -i "id:" | head -1 | awk '{print $2}')
    
    # Sauvegarder les identifiants dans le cache
    echo "SCREEN_ID=\"$SCREEN_ID\"" > "$CACHE_FILE"
    echo "AUDIO_ID=\"$AUDIO_ID\"" >> "$CACHE_FILE"
    echo "MIC_ID=\"$MIC_ID\"" >> "$CACHE_FILE"
    
    echo "✅ Identifiants trouvés et mis en cache pour les prochaines utilisations"
fi

# Vérifier si un écran a été trouvé
if [ -z "$SCREEN_ID" ]; then
  echo "❌ Aucun écran trouvé"
  exit 1
fi

# Configurer les paramètres audio système
if [ -n "$AUDIO_ID" ]; then
  echo "🔊 Utilisation du casque Bose pour l'audio système: $AUDIO_ID"
  AUDIO_PARAM="--audio-device $AUDIO_ID"
else
  echo "⚠️ Casque Bose non trouvé pour l'audio système"
  AUDIO_PARAM=""
fi

# Configurer les paramètres du microphone
if [ -n "$MIC_ID" ]; then
  echo "🎤 Utilisation du casque Bose comme microphone: $MIC_ID"
  MIC_PARAM="--microphone-device $MIC_ID"
else
  echo "⚠️ Casque Bose non trouvé comme microphone"
  MIC_PARAM=""
fi

# Définir les chemins des fichiers
TEMP_VIDEO="/tmp/audio-capture-test.mp4"
FINAL_AUDIO="/tmp/audio-capture.mp3"

# Exécuter l'enregistrement avec une résolution minimale
echo ""
echo "🎬 Démarrage de la capture audio (Ctrl+C pour arrêter)..."
echo "📋 Commande: $SCREENCAPTUREKIT_BIN record --screen $SCREEN_ID $AUDIO_PARAM $MIC_PARAM --output $TEMP_VIDEO --duration 10"
"$SCREENCAPTUREKIT_BIN" record --screen $SCREEN_ID $AUDIO_PARAM $MIC_PARAM --output $TEMP_VIDEO --duration 10

echo ""
echo "✅ Capture terminée"

# Extraire et mixer l'audio avec FFmpeg
echo "🔄 Extraction et mixage de l'audio..."
# Extraire les informations sur les pistes audio
AUDIO_INFO=$(ffprobe -v error -show_entries stream=index,codec_type -of csv=p=0 "$TEMP_VIDEO" | grep audio)

# Vérifier s'il y a des pistes audio
if [[ $(echo "$AUDIO_INFO" | wc -l) -ge 1 ]]; then
    # Obtenir les indices des pistes audio
    AUDIO_STREAMS=$(echo "$AUDIO_INFO" | cut -d',' -f1 | sed 's/^/0:/g')
    
    if [[ $(echo "$AUDIO_INFO" | wc -l) -ge 2 ]]; then
        echo "🔊 Mixage de $(echo "$AUDIO_INFO" | wc -l) pistes audio..."
        
        # Créer le filtre complex pour mixer les pistes audio
        FILTER_COMPLEX="[${AUDIO_STREAMS// /][}]amix=inputs=$(echo "$AUDIO_INFO" | wc -l):duration=longest[aout]"
        
        # Extraire l'audio mixé avec FFmpeg
        ffmpeg -v warning -i "$TEMP_VIDEO" -filter_complex "$FILTER_COMPLEX" -vn -c:a libmp3lame -q:a 2 "$FINAL_AUDIO"
    else
        echo "⚠️ Une seule piste audio détectée, pas besoin de mixage."
        # Extraire uniquement l'audio sans mixage
        ffmpeg -v warning -i "$TEMP_VIDEO" -vn -c:a libmp3lame -q:a 2 "$FINAL_AUDIO"
    fi
    
    echo "✅ Extraction audio terminée: $FINAL_AUDIO"
else
    echo "❌ Aucune piste audio détectée dans l'enregistrement."
    exit 1
fi

# Supprimer le fichier vidéo temporaire
rm "$TEMP_VIDEO"

echo "📂 Vérifiez le fichier audio: $FINAL_AUDIO"
echo "🎵 Pour l'écouter: ffplay \"$FINAL_AUDIO\"" 