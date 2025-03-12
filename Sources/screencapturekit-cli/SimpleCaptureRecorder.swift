import Foundation
import AVFoundation
import ScreenCaptureKit

/// Enregistreur simplifié pour tester la capture audio
class SimpleCaptureRecorder {
    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var microphoneInput: AVAssetWriterInput?
    private var videoOutputDelegate: VideoOutputDelegate?
    private var audioOutputDelegate: AudioOutputDelegate?
    private var microphoneOutputDelegate: AudioOutputDelegate?
    private var isRecording = false
    private var outputURL: URL
    
    init(outputURL: URL) {
        self.outputURL = outputURL
        print("SimpleCaptureRecorder initialisé avec URL: \(outputURL)")
    }
    
    func startRecording(screenId: CGDirectDisplayID, audioDeviceId: String?, microphoneDeviceId: String?) async throws {
        print("⏱️ Démarrage de l'enregistrement...")
        print("- Écran: \(screenId)")
        print("- Périphérique audio: \(audioDeviceId ?? "aucun")")
        print("- Microphone: \(microphoneDeviceId ?? "aucun")")
        
        // Vérifier les permissions d'enregistrement d'écran
        guard CGPreflightScreenCaptureAccess() else {
            throw NSError(domain: "ScreenCaptureError", code: 1, userInfo: [NSLocalizedDescriptionKey: "Permission d'enregistrement d'écran refusée"])
        }
        
        // Créer l'AssetWriter
        try setupAssetWriter(withAudio: audioDeviceId != nil, withMicrophone: microphoneDeviceId != nil)
        
        // Configurer le flux de capture
        try await setupCaptureStream(screenId: screenId, audioDeviceId: audioDeviceId, microphoneDeviceId: microphoneDeviceId)
        
        // Démarrer la capture
        try await stream?.startCapture()
        isRecording = true
        print("✅ Enregistrement démarré avec succès")
    }
    
    func stopRecording() async throws {
        guard isRecording, let stream = self.stream else {
            print("❌ Aucun enregistrement en cours")
            return
        }
        
        print("⏱️ Arrêt de l'enregistrement...")
        
        // Arrêter la capture
        try await stream.stopCapture()
        print("✅ Capture arrêtée")
        
        // Finaliser les inputs
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        microphoneInput?.markAsFinished()
        print("✅ Inputs marqués comme terminés")
        
        // Finaliser l'écriture
        if let assetWriter = self.assetWriter {
            await assetWriter.finishWriting()
            print("✅ Écriture finalisée")
            
            // Vérifier la taille du fichier
            let fileManager = FileManager.default
            if let attributes = try? fileManager.attributesOfItem(atPath: outputURL.path),
               let fileSize = attributes[.size] as? NSNumber {
                print("📊 Taille du fichier: \(fileSize.doubleValue / 1024.0) KB")
            } else {
                print("⚠️ Impossible de déterminer la taille du fichier")
            }
        }
        
        isRecording = false
        print("✅ Enregistrement terminé")
    }
    
    private func setupAssetWriter(withAudio: Bool, withMicrophone: Bool) throws {
        // Vérifier si le fichier existe déjà et le supprimer
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: outputURL.path) {
            try fileManager.removeItem(at: outputURL)
            print("🗑️ Ancien fichier supprimé")
        }
        
        // Créer l'asset writer pour MP4
        assetWriter = try AVAssetWriter(url: outputURL, fileType: .mp4)
        print("✅ AssetWriter créé pour le fichier MP4")
        
        // Configurer le VideoInput
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: 1920,
            AVVideoHeightKey: 1080,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 8_000_000,
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
            ]
        ]
        
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        videoInput?.expectsMediaDataInRealTime = true
        
        // Configurer l'AudioInput avec des paramètres de haute qualité (audio système)
        if withAudio {
            let audioSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 256000
            ]
            
            audioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
            audioInput?.expectsMediaDataInRealTime = true
        }
        
        // Configurer l'entrée microphone
        if withMicrophone {
            let micSettings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 128000
            ]
            
            microphoneInput = AVAssetWriterInput(mediaType: .audio, outputSettings: micSettings)
            microphoneInput?.expectsMediaDataInRealTime = true
        }
        
        // Ajouter les inputs à l'asset writer
        if let videoInput = videoInput, assetWriter?.canAdd(videoInput) == true {
            assetWriter?.add(videoInput)
            print("✅ VideoInput ajouté")
        }
        
        if let audioInput = audioInput, assetWriter?.canAdd(audioInput) == true {
            assetWriter?.add(audioInput)
            print("✅ AudioInput (système) ajouté")
        }
        
        if let microphoneInput = microphoneInput, assetWriter?.canAdd(microphoneInput) == true {
            assetWriter?.add(microphoneInput)
            print("✅ MicrophoneInput ajouté")
        }
        
        // Démarrer l'écriture
        assetWriter?.startWriting()
        assetWriter?.startSession(atSourceTime: .zero)
        print("✅ Session d'écriture démarrée")
    }
    
    private func setupCaptureStream(screenId: CGDirectDisplayID, audioDeviceId: String?, microphoneDeviceId: String?) async throws {
        // Récupérer le contenu partageable
        let content = try await SCShareableContent.current
        
        // Trouver l'écran demandé
        guard let display = content.displays.first(where: { $0.displayID == screenId }) else {
            throw NSError(domain: "ScreenCaptureError", code: 2, userInfo: [NSLocalizedDescriptionKey: "Écran non trouvé: \(screenId)"])
        }
        
        // Créer le filtre
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        print("✅ Filtre de contenu créé")
        
        // Configurer le stream
        let configuration = SCStreamConfiguration()
        configuration.width = 1920
        configuration.height = 1080
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 60) // 60 FPS
        configuration.showsCursor = true
        
        // Configurer l'audio système
        if audioDeviceId != nil {
            configuration.capturesAudio = true
            configuration.excludesCurrentProcessAudio = false
            print("✅ Capture audio système activée")
        }
        
        // Configurer le microphone (si disponible et si nous sommes sur macOS 15.0+)
        if microphoneDeviceId != nil {
            if #available(macOS 15.0, *) {
                // Sur macOS Sequoia, utiliser l'API native pour le microphone
                configuration.captureMicrophone = true
                print("✅ Capture microphone activée avec l'API native de macOS 15")
            } else {
                // La propriété n'existe pas dans les anciennes versions, utilisons une approche alternative
                print("⚠️ Support du microphone non implémenté - nécessite macOS 15.0+")
                // Nous allons quand même essayer de capturer le micro via l'audio système
                configuration.capturesAudio = true
                configuration.excludesCurrentProcessAudio = false
            }
        }
        
        // Créer les délégués
        videoOutputDelegate = VideoOutputDelegate(videoInput: videoInput)
        
        if audioDeviceId != nil {
            audioOutputDelegate = AudioOutputDelegate(audioInput: audioInput, isMicrophone: false)
        }
        
        if microphoneDeviceId != nil {
            if #available(macOS 15.0, *) {
                microphoneOutputDelegate = AudioOutputDelegate(audioInput: microphoneInput, isMicrophone: true)
            } else {
                print("⚠️ Le support du microphone nécessite macOS 15.0+, le microphone sera ignoré")
            }
        }
        
        // Connecter les délégués entre eux pour la synchronisation
        if let videoDelegate = videoOutputDelegate {
            if let audioDelegate = audioOutputDelegate {
                videoDelegate.setAudioDelegate(audioDelegate)
            }
            
            if #available(macOS 15.0, *) {
                if let microphoneDelegate = microphoneOutputDelegate {
                    videoDelegate.setMicrophoneDelegate(microphoneDelegate)
                }
            }
            
            print("✅ Délégués connectés pour la synchronisation")
        }
        
        // Créer le stream
        stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
        
        // Ajouter les sorties
        if let stream = stream {
            try stream.addStreamOutput(videoOutputDelegate!, type: .screen, sampleHandlerQueue: DispatchQueue(label: "video-queue"))
            print("✅ Sortie vidéo ajoutée au stream")
            
            if audioDeviceId != nil, let audioDelegate = audioOutputDelegate {
                try stream.addStreamOutput(audioDelegate, type: .audio, sampleHandlerQueue: DispatchQueue(label: "audio-queue"))
                print("✅ Sortie audio système ajoutée au stream")
            }
            
            if #available(macOS 15.0, *) {
                if microphoneDeviceId != nil, let microphoneDelegate = microphoneOutputDelegate {
                    // Sur macOS 15+, utiliser le type .microphone correct
                    try stream.addStreamOutput(microphoneDelegate, type: .microphone, sampleHandlerQueue: DispatchQueue(label: "microphone-queue"))
                    print("✅ Sortie microphone ajoutée au stream avec type .microphone (macOS 15)")
                }
            }
        }
    }
}

// Délégué pour la sortie vidéo
class VideoOutputDelegate: NSObject, SCStreamOutput {
    private let videoInput: AVAssetWriterInput?
    private var firstSampleTime = CMTime.zero
    private var audioDelegate: AudioOutputDelegate?
    private var microphoneDelegate: AudioOutputDelegate?
    
    init(videoInput: AVAssetWriterInput?) {
        self.videoInput = videoInput
    }
    
    func setAudioDelegate(_ delegate: AudioOutputDelegate) {
        self.audioDelegate = delegate
    }
    
    @available(macOS 15.0, *)
    func setMicrophoneDelegate(_ delegate: AudioOutputDelegate) {
        self.microphoneDelegate = delegate
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let videoInput = videoInput, videoInput.isReadyForMoreMediaData, sampleBuffer.isValid else {
            return
        }
        
        // Pour la première frame, enregistrer le timestamp
        if firstSampleTime == .zero {
            firstSampleTime = sampleBuffer.presentationTimeStamp
            print("⏱️ Premier échantillon vidéo reçu à \(firstSampleTime.seconds)s")
            
            // Informer les délégués audio du premier timestamp vidéo
            audioDelegate?.setFirstVideoSampleTime(firstSampleTime)
            
            if #available(macOS 15.0, *) {
                microphoneDelegate?.setFirstVideoSampleTime(firstSampleTime)
            }
        }
        
        // Ajuster le timestamp
        let relativeTime = sampleBuffer.presentationTimeStamp - firstSampleTime
        
        // S'assurer que le frame est complet
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let status = attachments.first?[SCStreamFrameInfo.status] as? Int,
              SCFrameStatus(rawValue: status) == .complete else {
            return
        }
        
        // Retemporiser le buffer
        let timing = CMSampleTimingInfo(
            duration: sampleBuffer.duration,
            presentationTimeStamp: relativeTime,
            decodeTimeStamp: .invalid
        )
        
        do {
            let retimedBuffer = try CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing])
            videoInput.append(retimedBuffer)
        } catch {
            print("⚠️ Erreur lors de la retemporisation vidéo: \(error)")
        }
    }
}

// Délégué pour la sortie audio (système ou microphone)
class AudioOutputDelegate: NSObject, SCStreamOutput {
    private let audioInput: AVAssetWriterInput?
    private var firstSampleTime = CMTime.zero
    private var firstVideoSampleTime = CMTime.zero
    private var earlyAudioSamples = [CMSampleBuffer]()
    private var hasReceivedVideoSample = false
    private var isMicrophone: Bool
    
    init(audioInput: AVAssetWriterInput?, isMicrophone: Bool = false) {
        self.audioInput = audioInput
        self.isMicrophone = isMicrophone
    }
    
    func setFirstVideoSampleTime(_ time: CMTime) {
        firstVideoSampleTime = time
        hasReceivedVideoSample = true
        
        // Traiter les échantillons audio précoces
        processEarlyAudioSamples()
    }
    
    private func processEarlyAudioSamples() {
        for sample in earlyAudioSamples {
            processSampleBuffer(sample)
        }
        let count = earlyAudioSamples.count
        earlyAudioSamples.removeAll()
        print("✅ \(count) échantillons audio précoces traités" + (isMicrophone ? " (microphone)" : " (système)"))
    }
    
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        // Vérifier le type approprié (audio ou microphone)
        let expectedType: SCStreamOutputType
        
        if isMicrophone {
            if #available(macOS 15.0, *) {
                expectedType = .microphone
            } else {
                expectedType = .audio // Fallback pour les anciennes versions de macOS
            }
        } else {
            expectedType = .audio
        }
        
        guard type == expectedType, let audioInput = audioInput, audioInput.isReadyForMoreMediaData, sampleBuffer.isValid else {
            return
        }
        
        // Si c'est le premier échantillon audio, enregistrer le timestamp
        if firstSampleTime == .zero {
            firstSampleTime = sampleBuffer.presentationTimeStamp
            print("⏱️ Premier échantillon \(isMicrophone ? "microphone" : "audio système") reçu à \(firstSampleTime.seconds)s")
        }
        
        // Si la vidéo n'a pas encore commencé, stocker les échantillons
        if !hasReceivedVideoSample {
            earlyAudioSamples.append(sampleBuffer)
            return
        }
        
        processSampleBuffer(sampleBuffer)
    }
    
    private func processSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let audioInput = audioInput, audioInput.isReadyForMoreMediaData else {
            return
        }
        
        // Ajuster le timestamp par rapport au premier échantillon vidéo
        let relativeTime = sampleBuffer.presentationTimeStamp - firstVideoSampleTime
        
        // Retemporiser le buffer
        let timing = CMSampleTimingInfo(
            duration: sampleBuffer.duration,
            presentationTimeStamp: relativeTime,
            decodeTimeStamp: .invalid
        )
        
        do {
            let retimedBuffer = try CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing])
            audioInput.append(retimedBuffer)
            
            let source = isMicrophone ? "microphone" : "audio système"
            print("✅ Échantillon \(source) ajouté à \(relativeTime.seconds)s")
        } catch {
            print("⚠️ Erreur lors de la retemporisation audio \(isMicrophone ? "(microphone)" : "(système)"): \(error)")
        }
    }
} 