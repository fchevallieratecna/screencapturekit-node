# ScreenCaptureKit Node.js

A Node.js wrapper for Apple's `ScreenCaptureKit` module. This package allows screen recording on macOS with optimal performance using Apple's native APIs.

## Features

- High-performance screen recording
- HDR (High Dynamic Range) support for macOS 13+ (Ventura)
- System audio capture
- Microphone audio capture (macOS 15+)
- Direct-to-file recording (simplified API for macOS 15+)
- Post-processing capabilities for audio tracks with FFmpeg
- Cropping support (capture specific screen areas)
- Multiple options control (FPS, cursor display, click highlighting)
- Support for various video codecs (H264, HEVC, ProRes)
- Listing available screens and audio devices

## Requirements

- macOS 10.13 (High Sierra) or newer
- Node.js 14 or newer
- FFmpeg (for post-processing audio tracks)

### FFmpeg Installation

FFmpeg is required for post-processing audio tracks. Here's how to install it on different systems:

#### macOS
Using Homebrew:
```bash
brew install ffmpeg
```

#### Linux (Debian/Ubuntu)
Using apt package manager:
```bash
sudo apt update && sudo apt install ffmpeg
```

#### Windows
You have several options:

1. **Using Chocolatey** (recommended if you have Chocolatey installed):
```bash
choco install ffmpeg
```

2. **Using the MSI Installer** (easiest method):
   - Download the [FFmpeg Installer](https://github.com/icedterminal/ffmpeg-installer/releases) from GitHub
   - Run the MSI file and follow the installation wizard
   - FFmpeg will be automatically added to your system PATH

3. **Manual Installation**:
   - Download FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html)
   - Extract the archive
   - Add FFmpeg to your system PATH manually

To verify the installation on any system, open a terminal/command prompt and run:
```bash
ffmpeg -version
```

## Installation

```bash
npm install screencapturekit
```

## Usage

### Simple Screen Recording

```javascript
import createScreenRecorder from 'screencapturekit';

const recorder = createScreenRecorder();

// Start recording
await recorder.startRecording();

// Wait for desired duration...
setTimeout(async () => {
  // Stop recording
  const videoPath = await recorder.stopRecording();
  console.log('Video recorded at:', videoPath);
}, 5000);
```

### Recording with Advanced Options

```javascript
import createScreenRecorder from 'screencapturekit';

const recorder = createScreenRecorder();

// Start recording with options
await recorder.startRecording({
  fps: 60,
  showCursor: true,
  highlightClicks: true,
  screenId: 0,
  videoCodec: 'h264',
  enableHDR: true, // Enable HDR recording (macOS 13+)
  microphoneDeviceId: 'device-id', // Enable microphone capture (macOS 15+)
  recordToFile: true, // Use direct recording API (macOS 15+)
  cropArea: {
    x: 0,
    y: 0,
    width: 1920,
    height: 1080
  }
});

// Wait...

// Stop recording
const videoPath = await recorder.stopRecording();
```

### List Available Screens

```javascript
import { screens } from 'screencapturekit';

const availableScreens = await screens();
console.log(availableScreens);
```

### List Audio Devices

```javascript
import { audioDevices, microphoneDevices } from 'screencapturekit';

// System audio devices
const systemAudio = await audioDevices();
console.log(systemAudio);

// Microphone devices
const mics = await microphoneDevices();
console.log(mics);
```

### Check Support for Features

```javascript
import { supportsHDRCapture, supportsDirectRecordingAPI, supportsMicrophoneCapture } from 'screencapturekit';

if (supportsHDRCapture) {
  console.log('Your system supports HDR capture');
}

if (supportsDirectRecordingAPI) {
  console.log('Your system supports direct-to-file recording');
}

if (supportsMicrophoneCapture) {
  console.log('Your system supports microphone capture');
}
```

## Recording Options

| Option | Type | Default | Description |
|--------|------|------------|-------------|
| fps | number | 30 | Frames per second |
| cropArea | object | undefined | Cropping area {x, y, width, height} |
| showCursor | boolean | true | Display cursor in recording |
| highlightClicks | boolean | false | Highlight mouse clicks |
| screenId | number | 0 | ID of screen to capture |
| audioDeviceId | number | undefined | System audio device ID |
| microphoneDeviceId | string | undefined | Microphone device ID (macOS 15+) |
| videoCodec | string | 'h264' | Video codec ('h264', 'hevc', 'proRes422', 'proRes4444') |
| enableHDR | boolean | false | Enable HDR recording (macOS 13+) |
| recordToFile | boolean | false | Use direct recording API (macOS 15+) |
| audioOnly | boolean | false | Record audio only, will convert to mp3 after recording |

## Post-processing

When both system audio and microphone are recorded, the library uses FFmpeg to merge these tracks into a single video file. This happens automatically in the `stopRecording()` method. Make sure you have FFmpeg installed on your system.

## Development

```bash
npm install
npm run build
```

## Tests

```bash
npm test
```

## License

MIT
