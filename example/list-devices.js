// Exemple de listage des écrans et des périphériques audio
import { screens, audioDevices, microphoneDevices, supportsHDRCapture, videoCodecs } from 'screencapturekit';

async function main() {
  try {
    console.log('----------------------------------------------------');
    console.log('INFORMATIONS SUR LES PÉRIPHÉRIQUES DISPONIBLES');
    console.log('----------------------------------------------------');
    
    // Vérifier le support HDR
    console.log(`\n🎨 Support HDR: ${supportsHDRCapture ? '✅ Supporté' : '❌ Non supporté'}`);
    
    // Lister les codecs vidéo disponibles
    console.log('\n📹 CODECS VIDÉO DISPONIBLES:');
    console.log('----------------------------------------------------');
    if (videoCodecs && videoCodecs.size > 0) {
      for (const [key, value] of videoCodecs.entries()) {
        console.log(`   - ${key}: ${value}`);
      }
    } else {
      console.log('   Aucun codec vidéo disponible');
    }
    
    // Lister les écrans disponibles
    console.log('\n🖥️  ÉCRANS DISPONIBLES:');
    console.log('----------------------------------------------------');
    const availableScreens = await screens();
    if (availableScreens && availableScreens.length > 0) {
      availableScreens.forEach((screen, index) => {
        console.log(`   Screen ${index}: ID=${screen.id}, ${screen.width}x${screen.height}`);
      });
    } else {
      console.log('   Aucun écran disponible');
    }
    
    // Lister les périphériques audio système
    console.log('\n🔊 PÉRIPHÉRIQUES AUDIO SYSTÈME:');
    console.log('----------------------------------------------------');
    const systemAudio = await audioDevices();
    if (systemAudio && systemAudio.length > 0) {
      systemAudio.forEach((device, index) => {
        console.log(`   Device ${index}: ID=${device.id}, Name="${device.name}", Manufacturer="${device.manufacturer}"`);
      });
    } else {
      console.log('   Aucun périphérique audio système disponible');
    }
    
    // Lister les périphériques microphone (macOS 14+)
    console.log('\n🎤 PÉRIPHÉRIQUES MICROPHONE (macOS 14+):');
    console.log('----------------------------------------------------');
    try {
      const mics = await microphoneDevices();
      if (mics && mics.length > 0) {
        mics.forEach((mic, index) => {
          console.log(`   Mic ${index}: ID="${mic.id}", Name="${mic.name}", Manufacturer="${mic.manufacturer}"`);
        });
      } else {
        console.log('   Aucun microphone disponible');
      }
    } catch (error) {
      console.log(`   ❌ Non disponible: ${error.message}`);
    }
    
    console.log('\n✅ Fin de l\'énumération des périphériques');
  } catch (error) {
    console.error('❌ Erreur lors de l\'énumération des périphériques:', error);
  }
}

main(); 