// Exemple avancé avec différentes options d'enregistrement
import createScreenRecorder from 'screencapturekit';
import { screens, supportsHDRCapture } from 'screencapturekit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Durée d'enregistrement en millisecondes
const RECORDING_DURATION = 7000; // 7 secondes

async function main() {
  try {
    console.log('Démarrage de l\'exemple avancé d\'enregistrement d\'écran');
    
    // Obtenir les écrans disponibles
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('Aucun écran disponible pour l\'enregistrement');
    }
    
    // Afficher les écrans disponibles
    console.log('\nÉcrans disponibles:');
    availableScreens.forEach((screen, index) => {
      console.log(`   Screen ${index}: ID=${screen.id}, ${screen.width}x${screen.height}`);
    });
    
    // Utiliser le premier écran pour l'exemple
    const targetScreen = availableScreens[0];
    console.log(`\nUtilisation de l'écran 0 (ID=${targetScreen.id}) pour l'enregistrement`);
    
    // Créer un enregistreur d'écran
    const recorder = createScreenRecorder();
    
    // Préparer les options avancées
    const options = {
      fps: 60,
      showCursor: true,
      highlightClicks: true,
      screenId: targetScreen.id,
      videoCodec: 'h264', // Utilisez 'hevc' pour HEVC ou 'proRes422' pour ProRes
      enableHDR: supportsHDRCapture, // Activer HDR si disponible
      // Capturer uniquement une partie de l'écran (centré, 50% de la taille)
      cropArea: {
        x: Math.floor(targetScreen.width * 0.25),
        y: Math.floor(targetScreen.height * 0.25),
        width: Math.floor(targetScreen.width * 0.5),
        height: Math.floor(targetScreen.height * 0.5)
      }
    };
    
    console.log('\nOptions d\'enregistrement:');
    console.log(JSON.stringify(options, null, 2));
    
    // Démarrer l'enregistrement avec options avancées
    console.log('\nDémarrage de l\'enregistrement avec options avancées...');
    await recorder.startRecording(options);
    
    console.log(`Enregistrement en cours pendant ${RECORDING_DURATION/1000} secondes...`);
    console.log('(Zone de capture: rectangle central de 50% de l\'écran)');
    
    // Attendre la durée spécifiée
    await new Promise(resolve => setTimeout(resolve, RECORDING_DURATION));
    
    // Arrêter l'enregistrement
    console.log('Arrêt de l\'enregistrement...');
    const videoPath = await recorder.stopRecording();
    
    console.log(`\n✅ Vidéo enregistrée à: ${videoPath}`);
    console.log(`   Dimensions de capture: ${options.cropArea.width}x${options.cropArea.height}`);
    console.log(`   FPS: ${options.fps}`);
    console.log(`   HDR: ${options.enableHDR ? 'Activé' : 'Désactivé'}`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement:', error);
  }
}

main(); 