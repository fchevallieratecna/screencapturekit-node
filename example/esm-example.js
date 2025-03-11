// Exemple d'utilisation avec les imports ESM
import createScreenRecorder from 'screencapturekit';

// Durée d'enregistrement en millisecondes
const RECORDING_DURATION = 3000; // 3 secondes

async function main() {
  try {
    console.log('Démarrage de l\'exemple avec modules ES');
    
    // Créer un enregistreur
    const recorder = createScreenRecorder();
    
    // Démarrer l'enregistrement avec quelques options personnalisées
    console.log('Démarrage de l\'enregistrement...');
    await recorder.startRecording({
      fps: 60,
      showCursor: true,
      highlightClicks: true,
      videoCodec: 'h264'
    });
    
    console.log(`Enregistrement en cours pendant ${RECORDING_DURATION/1000} secondes...`);
    
    // Attendre la durée spécifiée
    await new Promise(resolve => setTimeout(resolve, RECORDING_DURATION));
    
    // Arrêter l'enregistrement
    console.log('Arrêt de l\'enregistrement...');
    const videoPath = await recorder.stopRecording();
    
    console.log(`✅ Vidéo enregistrée à: ${videoPath}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement:', error);
  }
}

main(); 