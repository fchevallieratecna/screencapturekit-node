// Example of screen capture with system audio
import createScreenRecorder from 'screencapturekit';
import { screens, audioDevices } from 'screencapturekit';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
  try {
    console.log('=== SCREEN CAPTURE WITH SYSTEM AUDIO ===');
    
    // Get available screens
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('No screens available');
    }
    
    // Get audio devices
    const audioDeviceList = await audioDevices();
    if (!audioDeviceList || audioDeviceList.length === 0) {
      throw new Error('No system audio devices available');
    }
    
    // Display audio devices
    console.log('\nAvailable audio devices:');
    audioDeviceList.forEach((device, index) => {
      console.log(`[${index}] ${device.name} (${device.manufacturer || 'Unknown manufacturer'})`);
    });
    
    // Select an audio device
    const audioChoice = await question('\nChoose an audio device [0-' + (audioDeviceList.length - 1) + ']: ');
    const audioIndex = parseInt(audioChoice, 10);
    
    if (isNaN(audioIndex) || audioIndex < 0 || audioIndex >= audioDeviceList.length) {
      throw new Error('Invalid audio device selection');
    }
    
    const selectedAudio = audioDeviceList[audioIndex];
    console.log(`\nSelected audio device: ${selectedAudio.name}`);
    
    // Use the first screen
    const screen = availableScreens[0];
    console.log(`Using screen: ${screen.width}x${screen.height}`);
    
    // Create recorder
    const recorder = createScreenRecorder();
    
    // Capture options
    const options = {
      screenId: screen.id,
      audioDeviceId: selectedAudio.id,
      fps: 30,
      showCursor: true,
      highlightClicks: true
    };
    
    // Start recording
    console.log('\nStarting recording...');
    await recorder.startRecording(options);
    
    // Record for 15 seconds
    console.log('Recording in progress (15 seconds)...');
    console.log('Play some audio on your system to test it!');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Stop recording
    console.log('Stopping recording...');
    const videoPath = await recorder.stopRecording();
    
    console.log(`\n✅ Video saved to: ${videoPath}`);
    rl.close();
  } catch (error) {
    console.error('❌ Error:', error);
    rl.close();
  }
}

main(); 