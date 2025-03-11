import os from "node:os";
import path from "node:path";
import { temporaryFile } from "tempy";
import * as macosVersion from "macos-version";
import fileUrl from "file-url";
// import { fixPathForAsarUnpack } from "electron-util";
import { execa, type ExecaChildProcess } from "execa";

/**
 * Generates a random identifier composed of alphanumeric characters.
 * @returns {string} A random identifier as a string.
 * @private
 */
const getRandomId = () => Math.random().toString(36).slice(2, 15);
// Workaround for https://github.com/electron/electron/issues/9459
// const BIN = path.join(fixPathForAsarUnpack(__dirname), "aperture");
const BIN = path.join(__dirname, "../dist/screencapturekit");

/**
 * Checks if the system supports HEVC (H.265) hardware encoding.
 * @returns {boolean} True if the system supports HEVC hardware encoding, false otherwise.
 * @private
 */
const supportsHevcHardwareEncoding = (() => {
  const cpuModel = os.cpus()[0].model;

  // All Apple silicon Macs support HEVC hardware encoding.
  if (cpuModel.startsWith("Apple ")) {
    // Source string example: 'Apple M1'
    return true;
  }

  // Get the Intel Core generation, the `4` in `Intel(R) Core(TM) i7-4850HQ CPU @ 2.30GHz`
  // More info: https://www.intel.com/content/www/us/en/processors/processor-numbers.html
  // Example strings:
  // - `Intel(R) Core(TM) i9-9980HK CPU @ 2.40GHz`
  // - `Intel(R) Core(TM) i7-4850HQ CPU @ 2.30GHz`
  const result = /Intel.*Core.*i\d+-(\d)/.exec(cpuModel);

  // Intel Core generation 6 or higher supports HEVC hardware encoding
  return result && Number.parseInt(result[1], 10) >= 6;
})();

/**
 * Checks if the system supports HDR capture.
 * @returns {boolean} True if the system supports HDR capture (macOS 13.0+), false otherwise.
 * @private
 */
const supportsHDR = (() => {
  return macosVersion.isMacOSVersionGreaterThanOrEqualTo("13.0"); // HDR requires macOS 13.0+ (Ventura)
})();

/**
 * Interface defining a cropping area for recording.
 * @typedef {Object} CropArea
 * @property {number} x - The X position of the starting point of the area.
 * @property {number} y - The Y position of the starting point of the area.
 * @property {number} width - The width of the area to capture.
 * @property {number} height - The height of the area to capture.
 */
type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Options for screen recording.
 * @typedef {Object} RecordingOptions
 * @property {number} fps - Frames per second.
 * @property {CropArea} [cropArea] - Area of the screen to capture.
 * @property {boolean} showCursor - Show the cursor in the recording.
 * @property {boolean} highlightClicks - Highlight mouse clicks.
 * @property {number} screenId - Identifier of the screen to capture.
 * @property {number} [audioDeviceId] - Identifier of the system audio device.
 * @property {string} [microphoneDeviceId] - Identifier of the microphone device.
 * @property {string} videoCodec - Video codec to use.
 * @property {boolean} [enableHDR] - Enable HDR recording (on macOS 13.0+).
 * @property {boolean} [recordToFile] - Use the direct recording API (on macOS 14.0+).
 */
type RecordingOptions = {
  fps: number;
  cropArea?: CropArea;
  showCursor: boolean;
  highlightClicks: boolean;
  screenId: number;
  audioDeviceId?: number;
  microphoneDeviceId?: string; // Added support for microphone capture
  videoCodec: string;
  enableHDR?: boolean; // Added support for HDR
  recordToFile?: boolean; // Added support for direct file recording
};

/**
 * Internal options for recording with ScreenCaptureKit.
 * @typedef {Object} RecordingOptionsForScreenCaptureKit
 * @property {string} destination - URL of the destination file.
 * @property {number} framesPerSecond - Frames per second.
 * @property {boolean} showCursor - Show the cursor in the recording.
 * @property {boolean} highlightClicks - Highlight mouse clicks.
 * @property {number} screenId - Identifier of the screen to capture.
 * @property {number} [audioDeviceId] - Identifier of the system audio device.
 * @property {string} [microphoneDeviceId] - Identifier of the microphone device.
 * @property {string} [videoCodec] - Video codec to use.
 * @property {Array} [cropRect] - Coordinates of the cropping area.
 * @property {boolean} [enableHDR] - Enable HDR recording.
 * @property {boolean} [useDirectRecordingAPI] - Use the direct recording API.
 * @private
 */
type RecordingOptionsForScreenCaptureKit = {
  destination: string;
  framesPerSecond: number;
  showCursor: boolean;
  highlightClicks: boolean;
  screenId: number;
  audioDeviceId?: number;
  microphoneDeviceId?: string; // Added support for microphone
  videoCodec?: string;
  cropRect?: [[x: number, y: number], [width: number, height: number]];
  enableHDR?: boolean; // Added support for HDR
  useDirectRecordingAPI?: boolean; // Use new recording API
};

/**
 * Main class for screen recording with ScreenCaptureKit.
 * Allows capturing the screen using Apple's native APIs.
 */
class ScreenCaptureKit {
  /** Path to the output video file. */
  videoPath: string | null = null;
  /** The ongoing recording process. */
  recorder?: ExecaChildProcess;
  /** Unique identifier of the recording process. */
  processId: string | null = null;

  /**
   * Creates a new instance of ScreenCaptureKit.
   * Checks that the macOS version is compatible (10.13+).
   * @throws {Error} If the macOS version is not supported.
   */
  constructor() {
    macosVersion.assertMacOSVersionGreaterThanOrEqualTo("10.13");
  }

  /**
   * Checks that recording has been started.
   * @throws {Error} If recording has not been started.
   * @private
   */
  throwIfNotStarted() {
    if (this.recorder === undefined) {
      throw new Error("Call `.startRecording()` first");
    }
  }

  /**
   * Starts screen recording.
   * @param {Partial<RecordingOptions>} options - Recording options.
   * @param {number} [options.fps=30] - Frames per second.
   * @param {CropArea} [options.cropArea] - Area of the screen to capture.
   * @param {boolean} [options.showCursor=true] - Show the cursor.
   * @param {boolean} [options.highlightClicks=false] - Highlight mouse clicks.
   * @param {number} [options.screenId=0] - Screen ID to capture.
   * @param {number} [options.audioDeviceId] - System audio device ID.
   * @param {string} [options.microphoneDeviceId] - Microphone device ID.
   * @param {string} [options.videoCodec="h264"] - Video codec to use.
   * @param {boolean} [options.enableHDR=false] - Enable HDR recording.
   * @param {boolean} [options.recordToFile=false] - Use the direct recording API.
   * @returns {Promise<void>} A promise that resolves when recording starts.
   * @throws {Error} If recording is already in progress or if the options are invalid.
   */
  async startRecording({
    fps = 30,
    cropArea = undefined,
    showCursor = true,
    highlightClicks = false,
    screenId = 0,
    audioDeviceId = undefined,
    microphoneDeviceId = undefined,
    videoCodec = "h264",
    enableHDR = false,
    recordToFile = false,
  }: Partial<RecordingOptions> = {}) {
    this.processId = getRandomId();
    return new Promise((resolve, reject) => {
      if (this.recorder !== undefined) {
        reject(new Error("Call `.stopRecording()` first"));
        return;
      }

      this.videoPath = temporaryFile({ extension: "mp4" });
      const recorderOptions: RecordingOptionsForScreenCaptureKit = {
        destination: fileUrl(this.videoPath as string),
        framesPerSecond: fps,
        showCursor,
        highlightClicks,
        screenId,
        audioDeviceId,
        microphoneDeviceId,
        useDirectRecordingAPI: recordToFile,
      };

      if (highlightClicks === true) {
        showCursor = true;
      }

      if (
        typeof cropArea === "object" &&
        (typeof cropArea.x !== "number" ||
          typeof cropArea.y !== "number" ||
          typeof cropArea.width !== "number" ||
          typeof cropArea.height !== "number")
      ) {
        reject(new Error("Invalid `cropArea` option object"));
        return;
      }

      if (videoCodec) {
        if (!videoCodecs.has(videoCodec)) {
          throw new Error(`Unsupported video codec specified: ${videoCodec}`);
        }

        recorderOptions.videoCodec = videoCodecs.get(videoCodec);
      }

      if (enableHDR) {
        if (!supportsHDR) {
          console.warn(
            "HDR requested but not supported on this macOS version. Falling back to SDR."
          );
        } else {
          recorderOptions.enableHDR = true;
        }
      }

      if (cropArea) {
        recorderOptions.cropRect = [
          [cropArea.x, cropArea.y],
          [cropArea.width, cropArea.height],
        ];
      }

      const timeout = setTimeout(resolve, 1000);
      this.recorder = execa(BIN, ["record", JSON.stringify(recorderOptions)]);

      this.recorder?.catch((error) => {
        clearTimeout(timeout);
        delete this.recorder;
        reject(error);
      });

      this.recorder?.stdout?.setEncoding("utf8");
      this.recorder?.stdout?.on("data", (data) => {
        console.log("From swift executable: ", data);
      });
    });
  }

  /**
   * Stops the ongoing recording.
   * @returns {Promise<string|null>} A promise that resolves with the path to the video file.
   * @throws {Error} If recording has not been started.
   */
  async stopRecording() {
    this.throwIfNotStarted();
    console.log("killing recorder");
    this.recorder?.kill();
    await this.recorder;
    console.log("killed recorder");
    this.recorder = undefined;

    return this.videoPath;
  }
}

/**
 * Creates and returns a new instance of ScreenCaptureKit.
 * @returns {ScreenCaptureKit} A new instance of the screen recorder.
 */
export default function () {
  return new ScreenCaptureKit();
}

/**
 * Retrieves the video codecs available on the system.
 * @returns {Map<string, string>} A map of available video codecs.
 * @private
 */
function getCodecs() {
  const codecs = new Map([
    ["h264", "H264"],
    ["hevc", "HEVC"],
    ["proRes422", "Apple ProRes 422"],
    ["proRes4444", "Apple ProRes 4444"],
  ]);

  if (!supportsHevcHardwareEncoding) {
    codecs.delete("hevc");
  }

  return codecs;
}

/**
 * Retrieves the list of screens available for recording.
 * @returns {Promise<Array>} A promise that resolves with an array of objects representing the screens.
 * Each object contains the properties id, width, and height.
 */
export const screens = async () => {
  const { stderr } = await execa(BIN, ["list", "screens"]);

  try {
    return JSON.parse(stderr);
  } catch {
    return stderr;
  }
};

/**
 * Retrieves the list of system audio devices available for recording.
 * @returns {Promise<Array>} A promise that resolves with an array of objects representing the audio devices.
 * Each object contains the properties id, name, and manufacturer.
 */
export const audioDevices = async () => {
  const { stderr } = await execa(BIN, ["list", "audio-devices"]);

  try {
    return JSON.parse(stderr);
  } catch {
    return stderr;
  }
};

/**
 * Retrieves the list of microphone devices available for recording.
 * @returns {Promise<Array>} A promise that resolves with an array of objects representing the microphones.
 * Each object contains the properties id, name, and manufacturer.
 */
export const microphoneDevices = async () => {
  const { stderr } = await execa(BIN, ["list", "microphone-devices"]);

  try {
    return JSON.parse(stderr);
  } catch {
    return stderr;
  }
};

/**
 * Indicates whether the current system supports HDR capture.
 * @type {boolean}
 */
export const supportsHDRCapture = supportsHDR;

/**
 * Map of video codecs available on the system.
 * @type {Map<string, string>}
 */
export const videoCodecs = getCodecs();