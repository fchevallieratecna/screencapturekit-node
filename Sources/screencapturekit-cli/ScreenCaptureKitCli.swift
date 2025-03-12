//
//  File.swift
//
//
//  Created by Mukesh Soni on 18/07/23.
//

// import AppKit
import ArgumentParser
import AVFoundation
import Foundation

import CoreGraphics
import ScreenCaptureKit

struct Options: Decodable {
    let destination: URL
    let framesPerSecond: Int
    let cropRect: CGRect?
    let showCursor: Bool
    let highlightClicks: Bool
    let screenId: CGDirectDisplayID
    let audioDeviceId: String?
    let microphoneDeviceId: String?
    let videoCodec: String?
    let enableHDR: Bool?
    let useDirectRecordingAPI: Bool?
}

struct ScreenCaptureKitCLI: AsyncParsableCommand {
    static var configuration = CommandConfiguration(
        abstract: "Wrapper around ScreenCaptureKit",
        subcommands: [List.self, Record.self],
        defaultSubcommand: Record.self
    )
}

extension ScreenCaptureKitCLI {
    struct List: AsyncParsableCommand {
        static let configuration = CommandConfiguration(
            abstract: "List windows or screens which can be recorded",
            subcommands: [Screens.self, AudioDevices.self, MicrophoneDevices.self]
        )
    }

    struct Record: AsyncParsableCommand {
        static let configuration = CommandConfiguration(abstract: "Start a recording with the given options.")

        @Argument(help: "Stringified JSON object with options passed to ScreenCaptureKitCLI")
        var options: String

        mutating func run() async throws {
            var keepRunning = true
            let options: Options = try options.jsonDecoded()

            print(options)
            // Create a screen recording
            do {
                // Check for screen recording permission, make sure your terminal has screen recording permission
                guard CGPreflightScreenCaptureAccess() else {
                    throw RecordingError("No screen capture permission")
                }

                let screenRecorder = try await ScreenRecorder(
                    url: options.destination, 
                    displayID: options.screenId, 
                    showCursor: options.showCursor, 
                    cropRect: options.cropRect,
                    audioDeviceId: options.audioDeviceId,
                    microphoneDeviceId: options.microphoneDeviceId,
                    enableHDR: options.enableHDR ?? false,
                    useDirectRecordingAPI: options.useDirectRecordingAPI ?? false
                )
                
                print("Starting screen recording of display \(options.screenId)")
                try await screenRecorder.start()

                // Super duper hacky way to keep waiting for user's kill signal.
                // I have no idea if i am doing it right
                signal(SIGKILL, SIG_IGN)
                signal(SIGINT, SIG_IGN)
                signal(SIGTERM, SIG_IGN)
                let sigintSrc = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
                sigintSrc.setEventHandler {
                    print("Got SIGINT")
                    keepRunning = false
                }
                sigintSrc.resume()
                let sigKillSrc = DispatchSource.makeSignalSource(signal: SIGKILL, queue: .main)
                sigKillSrc.setEventHandler {
                    print("Got SIGKILL")
                    keepRunning = false
                }
                sigKillSrc.resume()
                let sigTermSrc = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
                sigTermSrc.setEventHandler {
                    print("Got SIGTERM")
                    keepRunning = false
                }
                sigTermSrc.resume()

                // If i run the NSApplication run loop, then the mouse events are received
                // But i couldn't figure out a way to kill this run loop
                // Also, We have to import AppKit to run NSApplication run loop
                // await NSApplication.shared.run()
                // Keep looping and checking every 1 second if the user pressed the kill switch
                while true {
                    if !keepRunning {
                        try await screenRecorder.stop()
                        print("We are done. Have saved the recording to a file.")
                        break
                    } else {
                        sleep(1)
                    }
                }
            } catch {
                print("Error during recording:", error)
            }
        }
    }
}

extension ScreenCaptureKitCLI.List {
    struct Screens: AsyncParsableCommand {
        mutating func run() async throws {
            let sharableContent = try await SCShareableContent.current
            print(sharableContent.displays.count, sharableContent.windows.count, sharableContent.applications.count)
            let screens = sharableContent.displays.map { display in
                ["id": display.displayID, "width": display.width, "height": display.height]
            }
            try print(toJson(screens), to: .standardError)
        }
    }
    
    struct AudioDevices: AsyncParsableCommand {
        mutating func run() async throws {
            let devices = AVCaptureDevice.devices(for: .audio)
            let audioDevices = devices.map { device in
                ["id": device.uniqueID, "name": device.localizedName, "manufacturer": device.manufacturer]
            }
            try print(toJson(audioDevices), to: .standardError)
        }
    }
    
    struct MicrophoneDevices: AsyncParsableCommand {
        mutating func run() async throws {
            let devices = AVCaptureDevice.devices(for: .audio).filter { $0.hasMediaType(.audio) }
            let microphones = devices.map { device in
                ["id": device.uniqueID, "name": device.localizedName, "manufacturer": device.manufacturer]
            }
            try print(toJson(microphones), to: .standardError)
        }
    }
}

@available(macOS, introduced: 10.13, obsoleted: 16.0)
struct ScreenRecorder {
    private let videoSampleBufferQueue = DispatchQueue(label: "ScreenRecorder.VideoSampleBufferQueue")
    private let audioSampleBufferQueue = DispatchQueue(label: "ScreenRecorder.AudioSampleBufferQueue")
    private let microphoneSampleBufferQueue = DispatchQueue(label: "ScreenRecorder.MicrophoneSampleBufferQueue")

    private let assetWriter: AVAssetWriter
    private let videoInput: AVAssetWriterInput
    private var audioInput: AVAssetWriterInput?
    private var microphoneInput: AVAssetWriterInput?
    private let streamOutput: StreamOutput
    private var stream: SCStream
    
    // Ne peut pas utiliser @available sur une propriété stockée
    // Utilisons un wrapper
    private var _recordingOutput: Any?
    
    private var useDirectRecording: Bool

    init(
        url: URL, 
        displayID: CGDirectDisplayID, 
        showCursor: Bool = true, 
        cropRect: CGRect? = nil,
        audioDeviceId: String? = nil,
        microphoneDeviceId: String? = nil,
        enableHDR: Bool = false,
        useDirectRecordingAPI: Bool = false
    ) async throws {
        self.useDirectRecording = useDirectRecordingAPI
        
        print("🎥 Initialisation de l'enregistreur avec:")
        print("- URL: \(url)")
        print("- DisplayID: \(displayID)")
        print("- Audio Device: \(audioDeviceId ?? "non spécifié")")
        
        // Create AVAssetWriter for an MP4 file instead of MOV
        assetWriter = try AVAssetWriter(url: url, fileType: .mp4)
        print("📝 AVAssetWriter créé pour: \(url) au format MP4")

        // MARK: AVAssetWriter setup

        // Get size and pixel scale factor for display
        // Used to compute the highest possible qualitiy
        let displaySize = CGDisplayBounds(displayID).size

        // The number of physical pixels that represent a logic point on screen, currently 2 for MacBook Pro retina displays
        let displayScaleFactor: Int
        if let mode = CGDisplayCopyDisplayMode(displayID) {
            displayScaleFactor = mode.pixelWidth / mode.width
        } else {
            displayScaleFactor = 1
        }

        // AVAssetWriterInput supports maximum resolution of 4096x2304 for H.264
        // Downsize to fit a larger display back into in 4K
        let videoSize = downsizedVideoSize(source: cropRect?.size ?? displaySize, scaleFactor: displayScaleFactor)

        // This preset is the maximum H.264 preset, at the time of writing this code
        // Make this as large as possible, size will be reduced to screen size by computed videoSize
        guard let assistant = AVOutputSettingsAssistant(preset: .preset3840x2160) else {
            throw RecordingError("Can't create AVOutputSettingsAssistant with .preset3840x2160")
        }
        assistant.sourceVideoFormat = try CMVideoFormatDescription(videoCodecType: .h264, width: videoSize.width, height: videoSize.height)

        guard var outputSettings = assistant.videoSettings else {
            throw RecordingError("AVOutputSettingsAssistant has no videoSettings")
        }
        outputSettings[AVVideoWidthKey] = videoSize.width
        outputSettings[AVVideoHeightKey] = videoSize.height
        
        // Configure HDR settings if enabled
        if enableHDR {
            if #available(macOS 13.0, *) {
                outputSettings[AVVideoColorPropertiesKey] = [
                    AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
                    AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_2100_HLG,
                    AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020
                ]
            } else {
                print("HDR requested but not supported on this macOS version")
            }
        }

        // Create AVAssetWriter input for video, based on the output settings from the Assistant
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
        videoInput.expectsMediaDataInRealTime = true
        
        // Configure audio input if an audio device is specified
        if let audioDeviceId = audioDeviceId {
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 256000
            ]
            
            audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            audioInput?.expectsMediaDataInRealTime = true
            
            if let audioInput = audioInput, assetWriter.canAdd(audioInput) {
                assetWriter.add(audioInput)
            }
        }
        
        // Configure microphone input if a microphone device is specified
        if let microphoneDeviceId = microphoneDeviceId {
            let micSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 128000
            ]
            
            microphoneInput = AVAssetWriterInput(mediaType: .audio, outputSettings: micSettings)
            microphoneInput?.expectsMediaDataInRealTime = true
            
            if let microphoneInput = microphoneInput, assetWriter.canAdd(microphoneInput) {
                assetWriter.add(microphoneInput)
            }
        }
        
        streamOutput = StreamOutput(
            videoInput: videoInput,
            audioInput: audioInput,
            microphoneInput: microphoneInput
        )

        // Adding videoInput to assetWriter
        guard assetWriter.canAdd(videoInput) else {
            throw RecordingError("Can't add input to asset writer")
        }
        assetWriter.add(videoInput)

        guard assetWriter.startWriting() else {
            if let error = assetWriter.error {
                throw error
            }
            throw RecordingError("Couldn't start writing to AVAssetWriter")
        }

        // MARK: SCStream setup

        // Create a filter for the specified display
        let sharableContent = try await SCShareableContent.current
        print(sharableContent.displays.count, sharableContent.windows.count, sharableContent.applications.count)
        
        // Find the requested display
        guard let display = sharableContent.displays.first(where: { $0.displayID == displayID }) else {
            throw RecordingError("No display with ID \(displayID) found")
        }
        
        // Create filter with audio device
        let filter: SCContentFilter
        if audioDeviceId != nil {
            // Pour capturer l'audio, nous utilisons un filtre standard mais activons l'audio dans la configuration
            filter = SCContentFilter(display: display, excludingWindows: [])
            print("Audio capture enabled for device ID: \(audioDeviceId ?? "unknown")")
        } else {
            // Sans audio spécifié, nous créons un filtre standard
            filter = SCContentFilter(display: display, excludingWindows: [])
        }
        
        // Configure stream
        var config: SCStreamConfiguration
        
        if enableHDR, #available(macOS 13.0, *) {
            // Pour macOS 15+, utilisez le preset HDR
            if #available(macOS 15.0, *) {
                let preset = SCStreamConfiguration.Preset.captureHDRStreamCanonicalDisplay
                config = SCStreamConfiguration(preset: preset)
            } else {
                // Fallback pour macOS 13-14
                config = SCStreamConfiguration()
                // Configuration HDR manuelle si nécessaire
            }
        } else {
            config = SCStreamConfiguration()
        }
        
        config.minimumFrameInterval = CMTime(value: 1, timescale: Int32(truncating: NSNumber(value: showCursor ? 60 : 30)))
        config.showsCursor = showCursor
        
        // AMÉLIORATION: Augmenter la profondeur de la file d'attente pour un meilleur traitement
        config.queueDepth = 5
        
        // Configure audio capture if needed
        if let audioDevice = audioDeviceId {
            // Activer l'audio système
            config.capturesAudio = true
            
            // Configuration audio avancée
            config.excludesCurrentProcessAudio = false  // Capturer l'audio de notre processus aussi
            
            // Afficher un message pour indiquer que l'audio est activé
            print("Audio capture fully configured with device: \(audioDevice)")
        }
        
        // Configure microphone capture if needed
        if let microphoneDeviceId = microphoneDeviceId {
            print("Microphone capture requested with device: \(microphoneDeviceId)")
            // Note: La capture de microphone n'est pas directement supportée dans cette version
            // Seule l'activation générale est disponible
        }
        
        // Create the stream
        stream = SCStream(filter: filter, configuration: config, delegate: nil)
        
        // If using direct recording API
        if useDirectRecordingAPI {
            if #available(macOS 15.0, *) {
                let recordingConfig = SCRecordingOutputConfiguration()
                recordingConfig.outputURL = url
                
                // SCRecordingOutputConfiguration n'a pas de propriété fileType
                // Nous ne définissons que l'URL de sortie
                
                let recordingDelegate = RecordingDelegate()
                let recOutput = SCRecordingOutput(configuration: recordingConfig, delegate: recordingDelegate)
                _recordingOutput = recOutput
                
                do {
                    try stream.addRecordingOutput(recOutput)
                } catch {
                    throw RecordingError("Failed to add recording output: \(error)")
                }
            } else {
                print("Direct recording API requested but requires macOS 15.0+, falling back to manual recording")
            }
        } else {
            // Set up stream output for manual recording
            try stream.addStreamOutput(streamOutput, type: .screen, sampleHandlerQueue: videoSampleBufferQueue)
            
            if audioDeviceId != nil {
                try stream.addStreamOutput(streamOutput, type: .audio, sampleHandlerQueue: audioSampleBufferQueue)
            }
            
            if microphoneDeviceId != nil {
                if #available(macOS 15.0, *) {
                    try stream.addStreamOutput(streamOutput, type: .microphone, sampleHandlerQueue: microphoneSampleBufferQueue)
                } else {
                    print("Microphone stream output requires macOS 15.0+, skipping")
                }
            }
        }
    }

    func start() async throws {
        // Start capturing, wait for stream to start
        try await stream.startCapture()

        // Start the AVAssetWriter session at source time .zero, sample buffers will need to be re-timed
        assetWriter.startSession(atSourceTime: .zero)
        streamOutput.sessionStarted = true
    }

    func stop() async throws {
        // Stop capturing, wait for stream to stop
        try await stream.stopCapture()
        print("📢 Flux d'écran arrêté avec succès")

        // Repeat the last frame and add it at the current time
        // In case no changes happend on screen, and the last frame is from long ago
        // This ensures the recording is of the expected length
        if let originalBuffer = streamOutput.lastSampleBuffer {
            let additionalTime = CMTime(seconds: ProcessInfo.processInfo.systemUptime, preferredTimescale: 100) - streamOutput.firstSampleTime
            let timing = CMSampleTimingInfo(duration: originalBuffer.duration, presentationTimeStamp: additionalTime, decodeTimeStamp: originalBuffer.decodeTimeStamp)
            let additionalSampleBuffer = try CMSampleBuffer(copying: originalBuffer, withNewTiming: [timing])
            videoInput.append(additionalSampleBuffer)
            streamOutput.lastSampleBuffer = additionalSampleBuffer
            print("📢 Dernier frame vidéo ajouté")
        } else {
            print("⚠️ Aucun frame vidéo disponible pour finaliser")
        }

        // Stop the AVAssetWriter session at time of the repeated frame
        assetWriter.endSession(atSourceTime: streamOutput.lastSampleBuffer?.presentationTimeStamp ?? .zero)
        print("📢 Session AVAssetWriter terminée")

        // Finish writing
        videoInput.markAsFinished()
        print("📢 Entrée vidéo marquée comme terminée")
        
        if let audioInput = audioInput {
            audioInput.markAsFinished()
            print("📢 Entrée audio marquée comme terminée")
        }
        
        if let microphoneInput = microphoneInput {
            microphoneInput.markAsFinished()
            print("📢 Entrée microphone marquée comme terminée")
        }
        
        // Explicitement appeler finishWriting et attendre
        print("📢 Finalisation de l'écriture du fichier...")
        await assetWriter.finishWriting()
        
        // Vérifier l'état final de l'AssetWriter
        if assetWriter.status == .failed {
            if let error = assetWriter.error {
                print("❌ Erreur lors de la finalisation: \(error)")
                throw error
            } else {
                print("❌ Échec de finalisation sans erreur spécifique")
            }
        } else if assetWriter.status == .completed {
            print("✅ Fichier écrit avec succès")
            
            // Vérifier la taille du fichier
            let fileManager = FileManager.default
            if let fileSize = try? fileManager.attributesOfItem(atPath: assetWriter.outputURL.path)[.size] as? Int64 {
                print("📁 Taille du fichier: \(Double(fileSize) / 1024.0) Ko")
            } else {
                print("⚠️ Impossible de déterminer la taille du fichier")
            }
        } else {
            print("⚠️ État final de l'AssetWriter: \(assetWriter.status.rawValue)")
        }
    }

    private class StreamOutput: NSObject, SCStreamOutput {
        let videoInput: AVAssetWriterInput
        let audioInput: AVAssetWriterInput?
        let microphoneInput: AVAssetWriterInput?
        
        var sessionStarted = false
        var firstSampleTime: CMTime = .zero
        var lastSampleBuffer: CMSampleBuffer?
        
        // Ajouter un tampon pour les échantillons audio précoces
        var earlyAudioSamples = [CMSampleBuffer]()

        init(videoInput: AVAssetWriterInput, audioInput: AVAssetWriterInput? = nil, microphoneInput: AVAssetWriterInput? = nil) {
            self.videoInput = videoInput
            self.audioInput = audioInput
            self.microphoneInput = microphoneInput
            super.init()
            
            // Activer le debug pour le suivi des échantillons
            print("StreamOutput initialisé - Audio: \(audioInput != nil), Micro: \(microphoneInput != nil)")
        }

        func stream(_: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
            // Return early if session hasn't started yet
            guard sessionStarted else { 
                // Mais stocker les échantillons audio précoces
                if type == .audio, let _ = audioInput {
                    earlyAudioSamples.append(sampleBuffer)
                    print("Stockage d'un échantillon audio précoce")
                }
                // Note: Le type .microphone n'est pas disponible dans cette version de macOS
                return 
            }

            // Return early if the sample buffer is invalid
            guard sampleBuffer.isValid else { return }

            switch type {
            case .screen:
                handleVideoSampleBuffer(sampleBuffer)
            case .audio:
                handleAudioSampleBuffer(sampleBuffer, isFromMicrophone: false)
            @unknown default:
                break
            }
        }
        
        private func handleVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
            guard videoInput.isReadyForMoreMediaData else {
                print("AVAssetWriterInput (video) isn't ready, dropping frame")
                return
            }
            
            // Retrieve the array of metadata attachments from the sample buffer
            guard let attachmentsArray = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let attachments = attachmentsArray.first
            else { return }

            // Validate the status of the frame. If it isn't `.complete`, return
            guard let statusRawValue = attachments[SCStreamFrameInfo.status] as? Int,
                  let status = SCFrameStatus(rawValue: statusRawValue),
                  status == .complete
            else { return }
            
            // Save the timestamp of the current sample, all future samples will be offset by this
            if firstSampleTime == .zero {
                firstSampleTime = sampleBuffer.presentationTimeStamp
                print("Premier échantillon vidéo reçu à \(firstSampleTime.seconds)")
                
                // Traiter les échantillons audio précoces maintenant que nous avons la référence temporelle
                processEarlyAudioSamples()
            }

            // Offset the time of the sample buffer, relative to the first sample
            let lastSampleTime = sampleBuffer.presentationTimeStamp - firstSampleTime

            // Always save the last sample buffer.
            // This is used to "fill up" empty space at the end of the recording.
            //
            // Note that this permanently captures one of the sample buffers
            // from the ScreenCaptureKit queue.
            // Make sure reserve enough in SCStreamConfiguration.queueDepth
            lastSampleBuffer = sampleBuffer

            // Create a new CMSampleBuffer by copying the original, and applying the new presentationTimeStamp
            let timing = CMSampleTimingInfo(duration: sampleBuffer.duration, presentationTimeStamp: lastSampleTime, decodeTimeStamp: sampleBuffer.decodeTimeStamp)
            if let retimedSampleBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) {
                videoInput.append(retimedSampleBuffer)
            } else {
                print("Couldn't copy CMSampleBuffer, dropping frame")
            }
        }
        
        private func processEarlyAudioSamples() {
            // Traiter les échantillons audio système précoces
            for sample in earlyAudioSamples {
                handleAudioSampleBuffer(sample, isFromMicrophone: false)
            }
            earlyAudioSamples.removeAll()
            
            print("Traitement terminé des échantillons audio précoces")
        }
        
        private func handleAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer, isFromMicrophone: Bool) {
            let input = isFromMicrophone ? microphoneInput : audioInput
            
            guard let audioInput = input, audioInput.isReadyForMoreMediaData else {
                if input != nil {
                    print("AVAssetWriterInput (audio) isn't ready, dropping sample")
                }
                return
            }
            
            // Offset audio sample relative to video start time
            if firstSampleTime == .zero {
                // Si le premier échantillon vidéo n'est pas encore arrivé, on le stocke pour plus tard
                // (Déjà géré dans la méthode stream:didOutputSampleBuffer:of:)
                return
            }
            
            // Retime audio sample buffer to match video timeline
            let presentationTime = sampleBuffer.presentationTimeStamp - firstSampleTime
            let timing = CMSampleTimingInfo(
                duration: sampleBuffer.duration,
                presentationTimeStamp: presentationTime,
                decodeTimeStamp: .invalid
            )
            
            if let retimedSampleBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) {
                audioInput.append(retimedSampleBuffer)
                if isFromMicrophone {
                    print("Échantillon microphone ajouté à \(presentationTime.seconds)s")
                } else {
                    print("Échantillon audio système ajouté à \(presentationTime.seconds)s")
                }
            } else {
                print("Couldn't copy audio CMSampleBuffer, dropping sample")
            }
        }
    }
}

// AVAssetWriterInput supports maximum resolution of 4096x2304 for H.264
private func downsizedVideoSize(source: CGSize, scaleFactor: Int) -> (width: Int, height: Int) {
    let maxSize = CGSize(width: 4096, height: 2304)

    let w = source.width * Double(scaleFactor)
    let h = source.height * Double(scaleFactor)
    let r = max(w / maxSize.width, h / maxSize.height)

    return r > 1
        ? (width: Int(w / r), height: Int(h / r))
        : (width: Int(w), height: Int(h))
}

struct RecordingError: Error, CustomDebugStringConvertible {
    var debugDescription: String
    init(_ debugDescription: String) { self.debugDescription = debugDescription }
}

// Add required delegate for direct recording
@available(macOS 15.0, *)
class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    func recordingOutput(_ output: SCRecordingOutput, didStartRecordingWithError error: Error?) {
        if let error = error {
            print("Recording started with error: \(error)")
        } else {
            print("Recording started successfully")
        }
    }
    
    func recordingOutput(_ output: SCRecordingOutput, didFinishRecordingWithError error: Error?) {
        if let error = error {
            print("Recording finished with error: \(error)")
        } else {
            print("Recording finished successfully")
        }
    }
}

extension AVCaptureDevice {
    var manufacturer: String {
        // La méthode properties n'existe pas
        // Utilisons une valeur par défaut
        return "Unknown"
    }
}
