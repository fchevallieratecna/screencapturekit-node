// Audio-only recording example with keyboard control
import createScreenRecorder from 'screencapturekit';
import { screens, audioDevices, microphoneDevices } from 'screencapturekit';
import readline from 'readline';

// Readline interface for interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility function for questions
const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
  try {
    console.log('=== AUDIO-ONLY RECORDING ===');
    
    // Get available screens (required for API)
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('No screens available');
    }
    
    // Get audio devices
    const audioDeviceList = await audioDevices();
    const micDeviceList = await microphoneDevices();
    
    if ((!audioDeviceList || audioDeviceList.length === 0) && 
        (!micDeviceList || micDeviceList.length === 0)) {
      throw new Error('No audio devices available');
    }
    
    // Select audio devices
    let selectedAudioDevice = null;
    let selectedMicDevice = null;
    
    // System audio
    if (audioDeviceList && audioDeviceList.length > 0) {
      console.log('\n🔊 System Audio Devices:');
      console.log('--------------------');
      audioDeviceList.forEach((device, index) => {
        console.log(`[${index}] ${device.name} (${device.manufacturer || 'Unknown manufacturer'})`);
      });
      
      const useSystemAudio = await question('\nDo you want to capture system audio? (Y/n): ');
      if (useSystemAudio.toLowerCase() !== 'n') {
        const audioChoice = await question(`Choose a device [0-${audioDeviceList.length - 1}]: `);
        const audioIndex = parseInt(audioChoice, 10);
        
        if (!isNaN(audioIndex) && audioIndex >= 0 && audioIndex < audioDeviceList.length) {
          selectedAudioDevice = audioDeviceList[audioIndex];
          console.log(`✅ Selected system audio: ${selectedAudioDevice.name}`);
        }
      }
    }
    
    // Microphone
    if (micDeviceList && micDeviceList.length > 0) {
      console.log('\n🎤 Microphones:');
      console.log('--------------------');
      micDeviceList.forEach((mic, index) => {
        console.log(`[${index}] ${mic.name} (${mic.manufacturer || 'Unknown manufacturer'})`);
      });
      
      const useMicrophone = await question('\nDo you want to capture microphone? (Y/n): ');
      if (useMicrophone.toLowerCase() !== 'n') {
        const micChoice = await question(`Choose a microphone [0-${micDeviceList.length - 1}]: `);
        const micIndex = parseInt(micChoice, 10);
        
        if (!isNaN(micIndex) && micIndex >= 0 && micIndex < micDeviceList.length) {
          selectedMicDevice = micDeviceList[micIndex];
          console.log(`✅ Selected microphone: ${selectedMicDevice.name}`);
        }
      }
    }
    
    // Check that at least one source is selected
    if (!selectedAudioDevice && !selectedMicDevice) {
      throw new Error('No audio source selected');
    }
    
    // Create recorder
    const recorder = createScreenRecorder();
    
    // Basic options for audio-only recording
    const options = {
      screenId: availableScreens[0].id,
      audioDeviceId: selectedAudioDevice?.id,
      microphoneDeviceId: selectedMicDevice?.id,
      audioOnly: true,
      fps: 1,
      showCursor: false,
      highlightClicks: false,
      // Minimal area since we only keep audio
      cropArea: {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      }
    };
    
    // Close readline interface and configure raw mode
    rl.close();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    console.log('\nSetup complete:');
    console.log(`- System audio: ${selectedAudioDevice ? '✅' : '❌'}`);
    console.log(`- Microphone: ${selectedMicDevice ? '✅' : '❌'}`);
    
    console.log('\nPress:');
    console.log('- [s] to start/stop recording');
    console.log('- [q] to quit');
    
    let isRecording = false;
    
    // Key handler
    process.stdin.on('data', async (key) => {
      if (key === 's' && !isRecording) {
        isRecording = true;
        console.log('\n🔴 Recording started...');
        console.log('Press [s] to stop');
        await recorder.startRecording(options);
      } else if (key === 's' && isRecording) {
        isRecording = false;
        console.log('\n⏹️  Stopping recording...');
        const audioPath = await recorder.stopRecording();
        console.log(`\n✅ Audio saved to: ${audioPath}`);
      } else if (key === 'q') {
        if (isRecording) {
          console.log('\n⏹️  Stopping recording...');
          await recorder.stopRecording();
        }
        process.exit();
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main(); 