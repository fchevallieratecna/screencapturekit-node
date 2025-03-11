// Exemple simple d'enregistrement d'écran
import createScreenRecorder from 'screencapturekit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Durée d'enregistrement en millisecondes
const RECORDING_DURATION = 5000; // 5 secondes

async function main() {
  try {
    console.log('Démarrage de l\'exemple simple d\'enregistrement d\'écran');
    
    // Créer un enregistreur d'écran
    const recorder = createScreenRecorder();
    
    // Démarrer l'enregistrement avec des options par défaut
    console.log('Démarrage de l\'enregistrement...');
    await recorder.startRecording();
    
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