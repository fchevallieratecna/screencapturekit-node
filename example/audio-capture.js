// Exemple de capture audio (système et microphone)
import createScreenRecorder from 'screencapturekit';
import { screens, audioDevices, microphoneDevices } from 'screencapturekit';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Durée d'enregistrement en millisecondes
const RECORDING_DURATION = 15000; // 15 secondes

// Créer une interface readline pour l'interaction utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour poser une question et obtenir une réponse
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Fonction pour choisir un périphérique dans une liste
async function chooseDevice(devices, type) {
  if (!devices || devices.length === 0) {
    return null;
  }
  
  console.log(`\nPériphériques ${type} disponibles:`);
  devices.forEach((device, index) => {
    console.log(`   [${index}] ${device.name} (${device.manufacturer || 'Fabricant inconnu'}) (ID=${device.id})`);
  });
  
  const defaultChoice = 0;
  const input = await question(`Choisissez un périphérique ${type} [0-${devices.length - 1}] (défaut: ${defaultChoice}): `);
  const choice = input === '' ? defaultChoice : parseInt(input, 10);
  
  if (isNaN(choice) || choice < 0 || choice >= devices.length) {
    console.log(`Choix invalide, utilisation du périphérique ${defaultChoice}`);
    return devices[defaultChoice];
  }
  
  return devices[choice];
}

async function openYouTubeInBrowser(url) {
  console.log(`Ouverture de ${url} dans le navigateur par défaut...`);
  try {
    await execAsync(`open "${url}"`);
    return true;
  } catch (error) {
    console.error(`Erreur lors de l'ouverture du navigateur: ${error.message}`);
    return false;
  }
}

// Fonction pour générer un nom de fichier audio unique
function generateAudioFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), `audio-capture-${timestamp}.m4a`);
}

async function main() {
  try {
    console.log('=== CONFIGURATION DE CAPTURE AUDIO ===');
    
    // Obtenir les écrans disponibles (nécessaire même pour l'audio uniquement)
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('Aucun écran disponible pour l\'enregistrement, nécessaire même pour l\'audio');
    }
    
    // Utiliser le premier écran disponible
    const selectedScreen = availableScreens[0];
    console.log(`\nÉcran utilisé pour la capture (nécessaire pour l'API): ${selectedScreen.width}x${selectedScreen.height}`);
    
    // Obtenir les périphériques audio système
    const systemAudioDevices = await audioDevices();
    let selectedAudioDevice = null;
    let captureSystemAudio = false;
    
    if (!systemAudioDevices || systemAudioDevices.length === 0) {
      console.warn('⚠️ Aucun périphérique audio système disponible');
    } else {
      // Demander si l'utilisateur veut capturer l'audio système
      const captureAudio = await question('\nVoulez-vous capturer l\'audio système? (O/n): ');
      captureSystemAudio = captureAudio.toLowerCase() !== 'n';
      
      if (captureSystemAudio) {
        // Choisir un périphérique audio
        selectedAudioDevice = await chooseDevice(systemAudioDevices, 'audio');
        if (selectedAudioDevice) {
          console.log(`\n✅ Périphérique audio sélectionné: ${selectedAudioDevice.name} (ID=${selectedAudioDevice.id})`);
        }
      }
    }
    
    // Obtenir les microphones
    let micDevices = [];
    let selectedMic = null;
    let captureMicrophone = false;
    
    try {
      micDevices = await microphoneDevices();
      
      if (!micDevices || micDevices.length === 0) {
        console.warn('⚠️ Aucun microphone disponible');
      } else {
        // Demander si l'utilisateur veut capturer le microphone
        const captureMic = await question('\nVoulez-vous capturer le microphone? (O/n): ');
        captureMicrophone = captureMic.toLowerCase() !== 'n';
        
        if (captureMicrophone) {
          // Choisir un microphone
          selectedMic = await chooseDevice(micDevices, 'microphone');
          if (selectedMic) {
            console.log(`\n✅ Microphone sélectionné: ${selectedMic.name} (ID=${selectedMic.id})`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Capture microphone non disponible: ${error.message}`);
    }
    
    // Vérifier qu'au moins une source audio est sélectionnée
    if (!captureSystemAudio && !captureMicrophone) {
      console.error('❌ Erreur: Aucune source audio sélectionnée. Au moins une source est nécessaire.');
      rl.close();
      return;
    }
    
    // Demander la durée d'enregistrement
    const durationInput = await question(`\nDurée d'enregistrement en secondes (défaut: ${RECORDING_DURATION/1000}): `);
    const duration = durationInput === '' ? RECORDING_DURATION : parseInt(durationInput, 10) * 1000;
    
    if (isNaN(duration) || duration <= 0) {
      console.log(`Durée invalide, utilisation de la valeur par défaut: ${RECORDING_DURATION/1000} secondes`);
    }
    
    // Créer un enregistreur
    const recorder = createScreenRecorder();
    
    // Préparer les options - nous devons toujours capturer un écran minuscule car l'API demande une capture vidéo
    // mais nous allons nous concentrer sur l'audio
    const options = {
      // Capture vidéo minimaliste (1x1 pixel) car l'API l'exige
      fps: 1,
      showCursor: false,
      highlightClicks: false,
      // Écran requis même pour l'audio uniquement
      screenId: selectedScreen.id,
      // Audio
      captureSystemAudio: false, // Désactivé pour le test
      captureMicrophone: false, // Désactivé pour le test
      // Taille minimale pour la vidéo
      cropArea: {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      },
      // Chemin de sortie adapté pour un fichier audio
      outputPath: generateAudioFileName()
    };
    
    if (selectedAudioDevice && captureSystemAudio) {
      // Assurez-vous que audioDeviceId est bien une chaîne
      options.audioDeviceId = String(selectedAudioDevice.id);
      console.log(`\nUtilisation de l'audioDeviceId: ${options.audioDeviceId} (type: ${typeof options.audioDeviceId})`);
      options.captureSystemAudio = true;
    }
    
    if (selectedMic && captureMicrophone) {
      // Assurez-vous que microphoneId est bien une chaîne
      options.microphoneId = String(selectedMic.id);
      console.log(`\nUtilisation du microphoneId: ${options.microphoneId} (type: ${typeof options.microphoneId})`);
      options.captureMicrophone = true;
    }
    
    console.log('\nOptions d\'enregistrement:');
    console.log(JSON.stringify(options, null, 2));
    
    // Demander confirmation pour démarrer
    const startConfirm = await question('\nDémarrer l\'enregistrement audio? (O/n): ');
    
    if (startConfirm.toLowerCase() === 'n') {
      console.log('Enregistrement annulé.');
      rl.close();
      return;
    }
    
    // Démarrer l'enregistrement
    console.log('\nDémarrage de l\'enregistrement audio...');
    await recorder.startRecording(options);
    
    // Ouvrir YouTube dans le navigateur
    const youtubeURL = 'https://www.youtube.com/watch?v=xvFZjo5PgG0';
    await openYouTubeInBrowser(youtubeURL);
    
    console.log(`\nEnregistrement en cours pendant ${duration/1000} secondes...`);
    
    if (captureMicrophone) {
      console.log('Parlez dans votre microphone pour tester la capture audio!');
    }
    
    // Attendre la durée spécifiée
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Arrêter l'enregistrement
    console.log('Arrêt de l\'enregistrement...');
    const outputPath = await recorder.stopRecording();
    
    console.log(`\n✅ Audio enregistré à: ${outputPath}`);
    console.log('   L\'enregistrement contient:');
    console.log(`   - Audio système: ${options.captureSystemAudio ? '✅' : '❌'}`);
    console.log(`   - Audio microphone: ${options.captureMicrophone ? '✅' : '❌'}`);
    console.log('\nNote: Le fichier contient une vidéo minimale (1x1 pixel), car l\'API exige une capture vidéo.');
    console.log('      Vous pouvez extraire l\'audio avec un outil comme ffmpeg si besoin.');
    
    rl.close();
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement:', error);
    rl.close();
  }
}

main(); 