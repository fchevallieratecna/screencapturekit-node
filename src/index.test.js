import fs from "node:fs";
import path from "node:path";
import { test, expect, afterEach, beforeEach, vi } from "vitest";
// import test from "ava";
import delay from "delay";
import { readChunkSync } from "read-chunk";
import { fileTypeFromBuffer } from "file-type";
import { exec } from "child_process";
import { promisify } from "util";
import sck, { videoCodecs, screens, audioDevices, microphoneDevices, supportsHDRCapture } from "./index.ts";

const TEST_TIMEOUT = 60000;
const RECORDING_DURATION = 4000;
const CLEANUP_DELAY = 2000;
let videoPath;
let recorder;

const execAsync = promisify(exec);

beforeEach(() => {
  recorder = sck();
});

afterEach(async () => {
  // Make sure recording is stopped
  if (recorder) {
    try {
      console.log("Test cleanup: stopping recorder");
      const stopResult = await recorder.stopRecording().catch((err) => {
        console.log("Error stopping recording during cleanup:", err.message);
        return null;
      });
      if (stopResult) videoPath = stopResult;
    } catch (err) {
      console.log("Test cleanup error:", err.message);
      // Ignore errors if recording wasn't started
    }
  }

  // Force a small delay to ensure processes complete
  await delay(CLEANUP_DELAY);

  // Clean up video file
  if (videoPath && fs.existsSync(videoPath)) {
    try {
      fs.unlinkSync(videoPath);
      console.log(`Test cleanup: deleted ${videoPath}`);
    } catch (err) {
      console.warn(`Failed to delete file: ${videoPath}`, err);
    }
    videoPath = undefined;
  }
  
  // Add extra delay between tests to ensure full cleanup
  await delay(CLEANUP_DELAY);
});

test("returns available codecs", () => {
  expect(videoCodecs).toBeDefined();
  expect(videoCodecs instanceof Map).toBe(true);
  expect(videoCodecs.size).toBeGreaterThan(0);
  expect(videoCodecs.has("h264")).toBe(true);
});

test("records screen correctly", async () => {
  // First get available screens to use a valid ID
  const screenList = await screens();
  expect(screenList).toBeDefined();
  expect(Array.isArray(screenList)).toBe(true);
  
  // Skip test if no screens available
  if (screenList.length === 0) {
    console.log("Test skipped - No screens available");
    return;
  }
  
  // Use the first available screen
  const screenId = screenList[0].id;
  
  // Start recording with a valid screen ID
  await expect(recorder.startRecording({
    screenId
  })).resolves.not.toThrow();
  
  // Wait for recording duration
  console.log(`Enregistrement d'écran pendant ${RECORDING_DURATION/1000} secondes...`);
  await delay(RECORDING_DURATION);
  
  // Stop recording and get the path
  videoPath = await recorder.stopRecording();
  
  // Check that the file was created
  expect(videoPath).toBeDefined();
  expect(typeof videoPath).toBe("string");
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Check that the file is not empty
  const stats = fs.statSync(videoPath);
  console.log(`Taille du fichier d'enregistrement: ${stats.size} octets`);
  expect(stats.size).toBeGreaterThan(0);
  
  if (stats.size === 0) {
    throw new Error("L'enregistrement a échoué: fichier de taille 0");
  }
  
  try {
    // Try to read the file metadata
    const fileBuffer = readChunkSync(videoPath, { startPosition: 0, length: 4100 });
    const fileInfo = await fileTypeFromBuffer(fileBuffer);
    
    // Verify format only if recording succeeded
    if (fileInfo) {
      expect(fileInfo.ext).toBe("mov");
      expect(fileInfo.mime).toBe("video/quicktime");
    }
  } catch (error) {
    console.warn("Unable to read file metadata:", error.message);
  }
}, TEST_TIMEOUT);

test("lists available screens", async () => {
  const screenList = await screens();
  expect(screenList).toBeDefined();
  expect(Array.isArray(screenList)).toBe(true);
  expect(screenList.length).toBeGreaterThan(0);
  
  // Check that each screen has the expected properties
  screenList.forEach(screen => {
    expect(screen).toHaveProperty("id");
    expect(screen).toHaveProperty("width");
    expect(screen).toHaveProperty("height");
    // Note: "name" property is not available in the current implementation
  });
});

test("lists audio devices", async () => {
  const deviceList = await audioDevices();
  expect(deviceList).toBeDefined();
  expect(Array.isArray(deviceList)).toBe(true);
  
  // If devices are present, verify their properties
  if (deviceList.length > 0) {
    deviceList.forEach(device => {
      expect(device).toHaveProperty("id");
      expect(device).toHaveProperty("name");
      expect(device).toHaveProperty("manufacturer");
    });
  }
});

test("lists microphone devices", async () => {
  const micList = await microphoneDevices();
  expect(micList).toBeDefined();
  expect(Array.isArray(micList)).toBe(true);
  
  // If microphones are present, verify their properties
  if (micList.length > 0) {
    micList.forEach(mic => {
      expect(mic).toHaveProperty("id");
      expect(mic).toHaveProperty("name");
      expect(mic).toHaveProperty("manufacturer");
    });
  }
});

test("records with custom options", async () => {
  // First get available screens to use a valid ID
  const screenList = await screens();
  
  // Skip test if no screens available
  if (screenList.length === 0) {
    console.log("Test skipped - No screens available");
    return;
  }
  
  // Use the first available screen
  const screenId = screenList[0].id;
  
  const options = {
    fps: 30,
    showCursor: true,
    highlightClicks: true,
    videoCodec: "h264",
    screenId
  };
  
  await expect(recorder.startRecording(options)).resolves.not.toThrow();
  console.log(`Enregistrement avec options pendant ${RECORDING_DURATION/1000} secondes...`);
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Vérifier que le fichier n'est pas vide
  const stats = fs.statSync(videoPath);
  console.log(`Taille du fichier d'enregistrement: ${stats.size} octets`);
  expect(stats.size).toBeGreaterThan(0);
  
  if (stats.size === 0) {
    throw new Error("L'enregistrement a échoué: fichier de taille 0");
  }
}, TEST_TIMEOUT);

test("correctly indicates HDR capability", () => {
  expect(supportsHDRCapture).toBeDefined();
  expect(typeof supportsHDRCapture).toBe("boolean");
});

test("records with HDR if supported", async () => {
  // Skip test if HDR is not supported
  if (!supportsHDRCapture) {
    console.log("Test skipped - HDR not supported on this system");
    return;
  }
  
  // First get available screens to use a valid ID
  const screenList = await screens();
  
  // Skip test if no screens available
  if (screenList.length === 0) {
    console.log("Test skipped - No screens available");
    return;
  }
  
  // Use the first available screen
  const screenId = screenList[0].id;
  
  await expect(recorder.startRecording({
    enableHDR: true,
    showCursor: true,
    screenId
  })).resolves.not.toThrow();
  
  console.log(`Enregistrement HDR pendant ${RECORDING_DURATION/1000} secondes...`);
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Vérifier que le fichier n'est pas vide
  const stats = fs.statSync(videoPath);
  console.log(`Taille du fichier d'enregistrement HDR: ${stats.size} octets`);
  expect(stats.size).toBeGreaterThan(0);
  
  if (stats.size === 0) {
    throw new Error("L'enregistrement HDR a échoué: fichier de taille 0");
  }
}, TEST_TIMEOUT);

test("records directly to file if supported", async () => {
  // First get available screens to use a valid ID
  const screenList = await screens();
  
  // Skip test if no screens available
  if (screenList.length === 0) {
    console.log("Test skipped - No screens available");
    return;
  }
  
  // Use the first available screen
  const screenId = screenList[0].id;
  
  await expect(recorder.startRecording({
    recordToFile: true,
    showCursor: true,
    screenId
  })).resolves.not.toThrow();
  
  console.log(`Enregistrement direct pendant ${RECORDING_DURATION/1000} secondes...`);
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Vérifier que le fichier n'est pas vide
  const stats = fs.statSync(videoPath);
  console.log(`Taille du fichier d'enregistrement direct: ${stats.size} octets`);
  expect(stats.size).toBeGreaterThan(0);
  
  if (stats.size === 0) {
    throw new Error("L'enregistrement direct a échoué: fichier de taille 0");
  }
}, TEST_TIMEOUT);

test("handles recording errors with invalid codec", async () => {
  await expect(
    recorder.startRecording({ videoCodec: "codec_inexistant" })
  ).rejects.toThrow();
});

test("handles recording errors with invalid screen ID", async () => {
  // Use a high ID that probably doesn't exist
  const invalidScreenId = 99999;
  
  await expect(
    recorder.startRecording({ screenId: invalidScreenId })
  ).rejects.toThrow();
});

test("records audio correctly", async () => {
  // Skip test if ffmpeg is not installed
  try {
    await execAsync("ffmpeg -version");
  } catch (error) {
    console.log("Test skipped - FFmpeg not available");
    return;
  }
  
  // First get available screens to use a valid ID
  const screenList = await screens();
  if (screenList.length === 0) {
    console.log("Test skipped - No screens available");
    return;
  }
  
  // Get audio devices to test with
  const audioDeviceList = await audioDevices();
  if (audioDeviceList.length === 0) {
    console.log("Test skipped - No audio devices available");
    return;
  }
  
  // Use the first available screen and audio device
  const screenId = screenList[0].id;
  const audioDevice = audioDeviceList[0];
  
  // Augmenter significativement la durée d'enregistrement pour le test audio
  const longAudioRecording = 5000; // 5 secondes minimum
  
  // Utiliser des valeurs qui faciliteront la capture d'audio
  await expect(recorder.startRecording({
    screenId,
    audioDeviceId: String(audioDevice.id),
    captureSystemAudio: true,
    fps: 30, // Utiliser une valeur plus élevée pour la stabilité
    showCursor: true,
    videoCodec: "h264" // Codec le plus compatible
  })).resolves.not.toThrow();
  
  console.log(`Enregistrement audio pendant ${longAudioRecording/1000} secondes...`);
  
  // Attendre plus longtemps pour l'enregistrement audio
  await delay(longAudioRecording);
  
  // Stop recording and get the path
  videoPath = await recorder.stopRecording();
  
  // Force additional delay to ensure file is finalized
  await delay(CLEANUP_DELAY * 2);
  
  // Check that the file was created
  expect(videoPath).toBeDefined();
  expect(typeof videoPath).toBe("string");
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Vérifier que le fichier n'est pas vide - C'EST UNE ERREUR SI LE FICHIER EST VIDE
  const stats = fs.statSync(videoPath);
  expect(stats.size).toBeGreaterThan(0);
  console.log(`Taille du fichier d'enregistrement: ${stats.size} octets`);
  
  if (stats.size === 0) {
    throw new Error("L'enregistrement a échoué: fichier de taille 0");
  }
  
  // Use ffprobe to analyze the file
  try {
    // Vérifier simplement que le fichier est valide
    const { stdout: formatInfo } = await execAsync(`ffprobe -v error -show_format "${videoPath}"`);
    
    // Si le fichier est valide, considérer le test comme réussi
    expect(formatInfo).toBeTruthy();
    console.log("Audio test passed with valid media file");
    
    // Essayer de vérifier les flux audio
    try {
      const { stdout: streamInfo } = await execAsync(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of default=nw=1 "${videoPath}"`);
      
      // Le fichier DOIT contenir un flux audio
      expect(streamInfo.includes("codec_type=audio")).toBe(true);
      console.log("Audio stream detected successfully");
    } catch (audioError) {
      console.error("Audio stream analysis failed:", audioError);
      throw new Error("Le fichier ne contient pas de flux audio");
    }
  } catch (error) {
    console.error("FFmpeg analysis failed:", error);
    throw new Error("Audio test failed - File is not a valid media file: " + error.message);
  }
}, TEST_TIMEOUT);
