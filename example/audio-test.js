// Utilitaire de test audio pour ScreenCaptureKit
import createScreenRecorder from 'screencapturekit';
import { screens, audioDevices } from 'screencapturekit';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Activer le mode debug
process.env.DEBUG = 'screencapturekit:*';

// Fonction pour générer un nom de fichier unique
function generateTempFileName(prefix = 'test', extension = '.mp4') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `${prefix}-${timestamp}${extension}`);
}

async function main() {
  try {
    // Récupérer les écrans disponibles
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      console.error('❌ Aucun écran disponible pour l\'enregistrement');
      process.exit(1);
    }
    
    console.log(`\n🖥️ Utilisation de l'écran: ${availableScreens[0].width}x${availableScreens[0].height}`);
    
    // Récupérer les périphériques audio
    const systemAudioDevices = await audioDevices();
    if (!systemAudioDevices || systemAudioDevices.length === 0) {
      console.warn('⚠️ Aucun périphérique audio système disponible');
    } else {
      console.log('\n🔈 Périphériques audio disponibles:');
      systemAudioDevices.forEach((device, index) => {
        console.log(`   [${index}] ${device.name} (ID=${device.id})`);
      });
    }
    
    // Test simple
    console.log('\n\n🧪 TEST: Enregistrement simple');
    
    // Configurer l'enregistreur
    const recorder = createScreenRecorder();
    const outputPath = generateTempFileName('simple-test');
    
    // Options minimales
    const options = {
      fps: 30,
      showCursor: true,
      screenId: availableScreens[0].id,
      outputPath
    };
    
    console.log('\nOptions d\'enregistrement:');
    console.log(JSON.stringify(options, null, 2));
    
    // Démarrer l'enregistrement
    console.log('\nDémarrage de l\'enregistrement simple (sans audio)...');
    await recorder.startRecording(options);
    
    // Attendre 5 secondes
    console.log('Enregistrement en cours (5 secondes)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Arrêter l'enregistrement
    console.log('Arrêt de l\'enregistrement...');
    const finalPath = await recorder.stopRecording();
    
    // Vérifier le fichier
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      console.log(`\n✅ Vidéo enregistrée à: ${finalPath}`);
      console.log(`📊 Taille du fichier: ${(stats.size / 1024).toFixed(2)} Ko`);
      
      if (stats.size === 0) {
        console.error('❌ ERREUR: Le fichier est vide');
      } else {
        console.log('✅ Enregistrement de base réussi!');
        console.log(`Vous pouvez consulter la vidéo à: ${finalPath}`);
      }
    } else {
      console.error('❌ Erreur: Le fichier n\'existe pas');
    }
  } catch (error) {
    console.error('\n❌ Erreur:', error);
  }
}

main(); 