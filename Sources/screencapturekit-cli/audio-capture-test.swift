import Foundation
import ScreenCaptureKit
import AVFoundation

@main
struct AudioCaptureTest {
    static func main() async {
        do {
            // Afficher les écrans disponibles
            print("🖥️ Recherche des écrans disponibles...")
            let content = try await SCShareableContent.current
            
            // Afficher les écrans
            for (index, display) in content.displays.enumerated() {
                print("  [\(index)] ID: \(display.displayID), \(display.width)x\(display.height)")
            }
            
            // Afficher les périphériques audio disponibles
            print("\n🔊 Recherche des périphériques audio disponibles...")
            let devices = AVCaptureDevice.devices(for: .audio)
            
            for (index, device) in devices.enumerated() {
                print("  [\(index)] \(device.localizedName) (ID: \(device.uniqueID))")
            }
            
            // Paramètres
            let screenId = content.displays.first?.displayID ?? 1
            
            // Rechercher un périphérique audio pour la sortie système
            let audioDeviceId = devices.first { $0.localizedName.contains("Bose") || $0.localizedName.contains("Bose") }?.uniqueID
            
            // Rechercher un microphone pour la capture vocale (généralement le micro interne)
            let microphoneDeviceId = devices.first { $0.localizedName.contains("MacBook Pro") || $0.localizedName.contains("Built-in") }?.uniqueID
            
            let outputPath = "/tmp/audio-capture-test.mp4"
            
            print("\n📝 Paramètres d'enregistrement:")
            print("- Écran: \(screenId)")
            print("- Audio système: \(audioDeviceId ?? "Non spécifié")")
            print("- Microphone: \(microphoneDeviceId ?? "Non spécifié")")
            print("- Sortie: \(outputPath)")
            
            // Créer l'URL de sortie
            let outputURL = URL(fileURLWithPath: outputPath)
            
            // Créer l'enregistreur
            let recorder = SimpleCaptureRecorder(outputURL: outputURL)
            
            // Démarrer l'enregistrement
            print("\n🎬 Démarrage de l'enregistrement...")
            try await recorder.startRecording(
                screenId: screenId,
                audioDeviceId: audioDeviceId,
                microphoneDeviceId: microphoneDeviceId
            )
            
            // Enregistrer pendant 10 secondes
            print("⏱️ Enregistrement pendant 10 secondes...")
            try await Task.sleep(nanoseconds: 10_000_000_000)
            
            // Arrêter l'enregistrement
            print("🛑 Arrêt de l'enregistrement...")
            try await recorder.stopRecording()
            
            // Vérifier le fichier
            let fileManager = FileManager.default
            if fileManager.fileExists(atPath: outputPath) {
                if let attributes = try? fileManager.attributesOfItem(atPath: outputPath),
                   let fileSize = attributes[.size] as? NSNumber {
                    print("\n📊 Fichier créé: \(outputPath)")
                    print("📊 Taille: \(fileSize.doubleValue / 1024.0) KB")
                    
                    if fileSize.doubleValue > 0 {
                        print("✅ Test réussi! Le fichier a été créé correctement.")
                    } else {
                        print("❌ Échec: Le fichier est vide.")
                    }
                }
            } else {
                print("❌ Échec: Le fichier n'a pas été créé.")
            }
            
        } catch {
            print("❌ Erreur: \(error)")
        }
    }
} 