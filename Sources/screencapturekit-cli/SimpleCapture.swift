import Foundation
import ArgumentParser
import AVFoundation
import ScreenCaptureKit

struct SimpleCapture: AsyncParsableCommand {
    static var configuration = CommandConfiguration(
        commandName: "simplecapture",
        abstract: "Utilitaire simple de capture d'écran avec audio",
        subcommands: [List.self, Record.self],
        defaultSubcommand: Record.self
    )
    
    struct List: AsyncParsableCommand {
        static var configuration = CommandConfiguration(
            abstract: "Lister les périphériques disponibles",
            subcommands: [Screens.self, Audio.self, Microphones.self]
        )
        
        struct Screens: AsyncParsableCommand {
            mutating func run() async throws {
                print("Recherche des écrans disponibles...")
                let content = try await SCShareableContent.current
                
                print("\n📺 Écrans disponibles:")
                for (index, display) in content.displays.enumerated() {
                    print("  [\(index)] ID: \(display.displayID), \(display.width)x\(display.height)")
                }
                
                // Également écrire en JSON sur stderr pour la compatibilité avec les outils existants
                let screens = content.displays.map { display in
                    ["id": display.displayID, "width": display.width, "height": display.height]
                }
                try print(toJson(screens), to: .standardError)
            }
        }
        
        struct Audio: AsyncParsableCommand {
            mutating func run() async throws {
                print("Recherche des périphériques audio disponibles...")
                
                let devices = AVCaptureDevice.devices(for: .audio)
                
                print("\n🔊 Périphériques audio disponibles:")
                for (index, device) in devices.enumerated() {
                    print("  [\(index)] \(device.localizedName) (ID: \(device.uniqueID))")
                }
                
                // Également écrire en JSON sur stderr pour la compatibilité avec les outils existants
                let audioDevices = devices.map { device in
                    ["id": device.uniqueID, "name": device.localizedName]
                }
                try print(toJson(audioDevices), to: .standardError)
            }
        }
        
        struct Microphones: AsyncParsableCommand {
            mutating func run() async throws {
                print("Recherche des microphones disponibles...")
                
                let devices = AVCaptureDevice.devices(for: .audio).filter { $0.hasMediaType(.audio) }
                
                print("\n🎤 Microphones disponibles:")
                for (index, device) in devices.enumerated() {
                    print("  [\(index)] \(device.localizedName) (ID: \(device.uniqueID))")
                }
                
                // Également écrire en JSON sur stderr
                let microphones = devices.map { device in
                    ["id": device.uniqueID, "name": device.localizedName]
                }
                try print(toJson(microphones), to: .standardError)
            }
        }
    }
    
    struct Record: AsyncParsableCommand {
        @Option(name: .shortAndLong, help: "ID de l'écran à enregistrer")
        var screenId: Int = 1
        
        @Option(name: .shortAndLong, help: "ID du périphérique audio système (optionnel)")
        var audioDeviceId: String?
        
        @Option(name: .shortAndLong, help: "ID du microphone (optionnel)")
        var microphoneDeviceId: String?
        
        @Option(name: .shortAndLong, help: "Chemin du fichier de sortie")
        var output: String
        
        @Option(name: .shortAndLong, help: "Durée de l'enregistrement en secondes (0 = illimité)")
        var duration: Int = 0
        
        mutating func run() async throws {
            print("🎬 Démarrage de l'enregistrement...")
            print("- Écran: \(screenId)")
            print("- Audio système: \(audioDeviceId ?? "non spécifié")")
            print("- Microphone: \(microphoneDeviceId ?? "non spécifié")")
            print("- Sortie: \(output)")
            
            // Créer l'URL de sortie
            let outputURL = URL(fileURLWithPath: output)
            
            // Créer l'enregistreur
            let recorder = SimpleCaptureRecorder(outputURL: outputURL)
            
            // Intercepter les signaux pour arrêter proprement
            setupSignalHandling()
            
            // Démarrer l'enregistrement
            try await recorder.startRecording(
                screenId: CGDirectDisplayID(screenId),
                audioDeviceId: audioDeviceId,
                microphoneDeviceId: microphoneDeviceId
            )
            
            if duration > 0 {
                print("⏱️ Enregistrement pendant \(duration) secondes...")
                try await Task.sleep(nanoseconds: UInt64(duration) * 1_000_000_000)
                try await recorder.stopRecording()
                print("✅ Enregistrement terminé avec succès")
            } else {
                print("⏱️ Enregistrement en cours... (Ctrl+C pour arrêter)")
                
                // Boucle d'attente pour le signal d'arrêt
                while !shouldTerminate {
                    try await Task.sleep(nanoseconds: 1_000_000_000) // 1 seconde
                }
                
                print("🛑 Signal d'arrêt reçu")
                try await recorder.stopRecording()
                print("✅ Enregistrement terminé avec succès")
            }
        }
    }
}

// Variables pour la gestion des signaux
var shouldTerminate = false

// Configuration des gestionnaires de signaux
func setupSignalHandling() {
    signal(SIGINT, SIG_IGN)
    signal(SIGTERM, SIG_IGN)
    
    let sigintSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    sigintSource.setEventHandler {
        print("\n🛑 Signal SIGINT reçu, arrêt en cours...")
        shouldTerminate = true
    }
    sigintSource.resume()
    
    let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    sigtermSource.setEventHandler {
        print("\n🛑 Signal SIGTERM reçu, arrêt en cours...")
        shouldTerminate = true
    }
    sigtermSource.resume()
}

// Fonction utilitaire pour convertir en JSON
func toJson<T: Encodable>(_ value: T) throws -> String {
    let data = try JSONEncoder().encode(value)
    return String(data: data, encoding: .utf8) ?? ""
}

// Point d'entrée
struct SimpleCaptureCLI {
    static func main() async {
        await SimpleCapture.main()
    }
} 