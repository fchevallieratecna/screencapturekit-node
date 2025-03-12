// Simple screen capture example
import createScreenRecorder from 'screencapturekit';
import { screens } from 'screencapturekit';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    console.log('=== SIMPLE SCREEN CAPTURE ===');
    
    // Get available screens
    const availableScreens = await screens();
    if (!availableScreens || availableScreens.length === 0) {
      throw new Error('No screens available');
    }
    
    // Use the first screen
    const screen = availableScreens[0];
    console.log(`Selected screen: ${screen.width}x${screen.height}`);
    
    // Create recorder
    const recorder = createScreenRecorder();
    
    // Capture options
    const options = {
      screenId: screen.id,
      fps: 30,
      showCursor: true,
      highlightClicks: true
    };
    
    // Start recording
    console.log('\nStarting recording...');
    await recorder.startRecording(options);
    
    // Record for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Stop recording
    console.log('Stopping recording...');
    const videoPath = await recorder.stopRecording();
    
    console.log(`\n✅ Video saved to: ${videoPath}`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main(); 