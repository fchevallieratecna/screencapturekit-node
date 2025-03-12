// Example of listing screens and audio devices
import { screens, audioDevices, microphoneDevices, supportsHDRCapture, videoCodecs } from '../dist/index.js';

async function main() {
  try {
    console.log('=== AVAILABLE DEVICES INFORMATION ===');
    
    // Check HDR support
    console.log(`\n🎨 HDR Support: ${supportsHDRCapture ? '✅ Supported' : '❌ Not supported'}`);
    
    // List available video codecs
    console.log('\n📹 Available Video Codecs:');
    console.log('--------------------');
    if (videoCodecs && videoCodecs.size > 0) {
      for (const [key, value] of videoCodecs.entries()) {
        console.log(`[${key}] ${value}`);
      }
    } else {
      console.log('No video codecs available');
    }
    
    // List available screens
    console.log('\n🖥️  Available Screens:');
    console.log('--------------------');
    const availableScreens = await screens();
    if (availableScreens && availableScreens.length > 0) {
      availableScreens.forEach((screen, index) => {
        console.log(`[${index}] ${screen.width}x${screen.height} (${screen.name || 'Unnamed'})`);
      });
    } else {
      console.log('No screens available');
    }
    
    // List system audio devices
    console.log('\n🔊 System Audio Devices:');
    console.log('--------------------');
    const systemAudio = await audioDevices();
    if (systemAudio && systemAudio.length > 0) {
      systemAudio.forEach((device, index) => {
        console.log(`[${index}] ${device.name} (${device.manufacturer || 'Unknown manufacturer'})`);
      });
    } else {
      console.log('No system audio devices available');
    }
    
    // List microphone devices (macOS 14+)
    console.log('\n🎤 Microphone Devices (macOS 14+):');
    console.log('--------------------');
    try {
      const mics = await microphoneDevices();
      if (mics && mics.length > 0) {
        mics.forEach((mic, index) => {
          console.log(`[${index}] ${mic.name} (${mic.manufacturer || 'Unknown manufacturer'})`);
        });
      } else {
        console.log('No microphones available');
      }
    } catch (error) {
      console.log(`❌ Not available: ${error.message}`);
    }
    
    console.log('\n✅ Device enumeration complete');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main(); 