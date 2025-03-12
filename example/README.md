# ScreenCaptureKit Examples for Node.js

This directory contains examples demonstrating the usage of the `screencapturekit` Node.js library, which enables screen and audio recording on macOS using Apple's native APIs.

## Prerequisites

- macOS 10.13 (High Sierra) or later
- Node.js 14 or later
- The `screencapturekit` library installed (will be used from the parent directory)

## Installation

To install example dependencies:

```bash
cd example
npm install
```

## Included Examples

### 1. Basic Screen Recording

A simple example demonstrating how to start and stop screen recording.

```bash
npm start
```

### 2. Screen Recording with System Audio

An example combining screen capture with system audio.

```bash
npm run screen-with-audio
```

### 3. Audio-Only Recording

An example of audio recording (system and/or microphone) controlled by keystrokes.

```bash
npm run audio-only
```

### 4. Advanced Example

A comprehensive example showcasing various features including:
- Specific display selection
- Screen region capture
- HDR support (if available)
- Custom configuration (FPS, cursor, click highlighting)

```bash
npm run advanced
```

### 5. List Available Devices

A utility to list all available displays, audio devices, and microphones.

```bash
npm run list-devices
```

## Demonstrated Features

- Basic screen capture
- Specific window capture
- Multi-display capture
- System audio capture
- Microphone capture (macOS 14+)
- Audio-only recording
- Specific display selection
- Region capture
- Cursor display and click highlighting options
- HDR support (on macOS 13+)
- Various video codecs
- Device enumeration

## Notes

- Recording files are saved in a temporary directory
- Microphone capture requires macOS 14 (Sonoma) or later
- HDR support requires macOS 13 (Ventura) or later
- System audio capture requires user authorization 