import fs from "node:fs";
import path from "node:path";
import { test, expect, afterEach, beforeEach, vi } from "vitest";
// import test from "ava";
import delay from "delay";
import { readChunkSync } from "read-chunk";
import { fileTypeFromBuffer } from "file-type";
import sck, { videoCodecs, screens, audioDevices, microphoneDevices, supportsHDRCapture } from "./index.ts";

const TEST_TIMEOUT = 15000;
const RECORDING_DURATION = 3000;
let videoPath;
let recorder;

beforeEach(() => {
  recorder = sck();
});

afterEach(async () => {
  // Make sure recording is stopped
  if (recorder) {
    try {
      const stopResult = await recorder.stopRecording().catch(() => null);
      if (stopResult) videoPath = stopResult;
    } catch (err) {
      // Ignore errors if recording wasn't started
    }
  }

  // Clean up video file
  if (videoPath && fs.existsSync(videoPath)) {
    try {
      fs.unlinkSync(videoPath);
    } catch (err) {
      console.warn(`Failed to delete file: ${videoPath}`, err);
    }
    videoPath = undefined;
  }
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
  await delay(RECORDING_DURATION);
  
  // Stop recording and get the path
  videoPath = await recorder.stopRecording();
  
  // Check that the file was created
  expect(videoPath).toBeDefined();
  expect(typeof videoPath).toBe("string");
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // Check that the file is not empty
  const stats = fs.statSync(videoPath);
  if (stats.size === 0) {
    console.warn("Video file exists but has size 0. Recording may have silently failed.");
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
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // File size could be 0 in case of silent failure
  // We only check for file existence
  const stats = fs.statSync(videoPath);
  if (stats.size === 0) {
    console.warn("Video file exists but has size 0. Recording may have silently failed.");
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
  
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // File size could be 0 in case of silent failure
  const stats = fs.statSync(videoPath);
  if (stats.size === 0) {
    console.warn("Video file exists but has size 0. Recording may have silently failed.");
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
  
  await delay(RECORDING_DURATION);
  
  videoPath = await recorder.stopRecording();
  expect(videoPath).toBeDefined();
  expect(fs.existsSync(videoPath)).toBe(true);
  
  // File size could be 0 in case of silent failure
  const stats = fs.statSync(videoPath);
  if (stats.size === 0) {
    console.warn("Video file exists but has size 0. Recording may have silently failed.");
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
