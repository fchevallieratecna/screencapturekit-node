import os from "node:os";
import { temporaryFile } from "tempy";
import * as macosVersion from "macos-version";
import fileUrl from "file-url";
import { execa, type ExecaChildProcess } from "execa";
import { resolvePackagePath } from "./utils/packagePaths.js";

const BIN = resolvePackagePath("./screencapturekit"); // Simplified path

/**
 * Generates a random identifier composed of alphanumeric characters.
 * @returns {string} A random identifier as a string.
 * @private
 */
const getRandomId = () => Math.random().toString(36).slice(2, 15);

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
 * Checks if the system supports the direct recording API.
 * @returns {boolean} True if the system supports direct recording API (macOS 15.0+), false otherwise.
 * @private
 */
const supportsDirectRecordingAPI = (() => {
  return macosVersion.isMacOSVersionGreaterThanOrEqualTo("15.0"); // Direct Recording API requires macOS 15.0+
})();

/**
 * Checks if the system supports microphone capture.
 * @returns {boolean} True if the system supports microphone capture (macOS 15.0+), false otherwise.
 * @private
 */
const supportsMicrophoneCapture = (() => {
  return macosVersion.isMacOSVersionGreaterThanOrEqualTo("15.0"); // Microphone support with SCStream requires macOS 15.0+
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

export type { CropArea };

type Screen = {
  id: number;
  width: number;
  height: number;
};

export type { Screen };

type AudioDevice = {
  id: string;
  name: string;
  manufacturer: string;
};

export type { AudioDevice };

type MicrophoneDevice = AudioDevice;

export type { MicrophoneDevice };

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
 * @property {boolean} [audioOnly] - Record audio only, will convert to mp3 after recording.
 */
type RecordingOptions = {
  fps: number;
  cropArea?: CropArea;
  showCursor: boolean;
  highlightClicks: boolean;
  screenId: number;
  audioDeviceId?: number;
  microphoneDeviceId?: string;
  videoCodec: string;
  enableHDR?: boolean;
  recordToFile?: boolean;
  audioOnly?: boolean;
};

export type { RecordingOptions };

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
  /** Options used for recording */
  private currentOptions?: Partial<RecordingOptions>;
  /** Path to the final processed video file */
  processedVideoPath: string | null = null;

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
    audioOnly = false,
  }: Partial<RecordingOptions> = {}) {
    this.processId = getRandomId();
    // Stocke les options actuelles pour utilisation ultérieure
    this.currentOptions = {
      fps,
      cropArea,
      showCursor,
      highlightClicks,
      screenId,
      audioDeviceId,
      microphoneDeviceId,
      videoCodec,
      enableHDR,
      recordToFile,
      audioOnly,
    };
    
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

      if (microphoneDeviceId) {
        if (!supportsMicrophoneCapture) {
          console.warn(
            "Microphone capture requested but requires macOS 15.0+. This feature will be ignored."
          );
        } else {
          recorderOptions.microphoneDeviceId = microphoneDeviceId;
        }
      }

      if (recordToFile) {
        if (!supportsDirectRecordingAPI) {
          console.warn(
            "Direct recording API requested but requires macOS 15.0+. Falling back to manual recording."
          );
        } else {
          recorderOptions.useDirectRecordingAPI = true;
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
   * Stops the ongoing recording and processes the video to merge audio tracks if needed.
   * @returns {Promise<string|null>} A promise that resolves with the path to the processed video file.
   * @throws {Error} If recording has not been started.
   */
  async stopRecording() {
    this.throwIfNotStarted();
    console.log("Arrêt de l'enregistrement");
    this.recorder?.kill();
    await this.recorder;
    console.log("Enregistrement arrêté");
    this.recorder = undefined;

    if (!this.videoPath) {
      return null;
    }

    let currentFile = this.videoPath;

    // Si nous avons plusieurs sources audio, nous devons les fusionner
    const hasMultipleAudioTracks = !!(
      this.currentOptions?.audioDeviceId && 
      this.currentOptions?.microphoneDeviceId
    );

    if (hasMultipleAudioTracks) {
      try {
        console.log("Fusion des pistes audio avec ffmpeg");
        this.processedVideoPath = temporaryFile({ extension: "mp4" });
        
        // Vérifier la structure du fichier avec ffprobe
        const { stdout: probeOutput } = await execa("ffprobe", [
          "-v", "error",
          "-show_entries", "stream=index,codec_type",
          "-of", "json",
          currentFile
        ]);
        
        const probeResult = JSON.parse(probeOutput);
        const streams = probeResult.streams || [];
        
        // Identifier les indices des flux audio et vidéo
        const audioStreams = streams
          .filter((stream: {codec_type: string; index: number}) => stream.codec_type === "audio")
          .map((stream: {index: number}) => stream.index);
          
        const videoStream = streams
          .find((stream: {codec_type: string; index: number}) => stream.codec_type === "video")?.index;
          
        if (audioStreams.length < 2 || videoStream === undefined) {
          console.log("Pas assez de pistes audio pour fusionner ou pas de piste vidéo");
        } else {
          const systemAudioIndex = audioStreams[0];
          const microphoneIndex = audioStreams[1];
          
          const filterComplex = `[0:${systemAudioIndex}]volume=1[a1];[0:${microphoneIndex}]volume=3[a2];[a1][a2]amerge=inputs=2[aout]`;
          
          // Traitement vidéo
          await execa("ffmpeg", [
            "-i", currentFile,
            "-filter_complex", filterComplex,
            "-map", "[aout]",
            "-map", `0:${videoStream}`,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-ac", "2",
            "-y",
            this.processedVideoPath
          ]);
          
          currentFile = this.processedVideoPath;
        }
      } catch (error) {
        console.error("Erreur lors de la fusion des pistes audio:", error);
      }
    }

    // Si audioOnly est activé, convertir en MP3
    if (this.currentOptions?.audioOnly) {
      try {
        console.log("Conversion en MP3");
        const audioPath = temporaryFile({ extension: "mp3" });
        
        await execa("ffmpeg", [
          "-i", currentFile,
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "192k",
          "-y",
          audioPath
        ]);
        
        return audioPath;
      } catch (error) {
        console.error("Erreur lors de la conversion en MP3:", error);
        return currentFile;
      }
    }

    return currentFile;
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
export const screens = async (): Promise<Screen[] | string> => {
  const { stderr } = await execa(BIN, ["list", "screens"]);
console.log("stderr", stderr);
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
export const audioDevices = async (): Promise<AudioDevice[] | string> => {
  const { stderr } = await execa(BIN, ["list", "audio-devices"]);
  console.log("stderr", stderr);
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
export const microphoneDevices = async (): Promise<MicrophoneDevice[] | string> => {
  const { stderr } = await execa(BIN, ["list", "microphone-devices"]);
  console.log("stderr", stderr);
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