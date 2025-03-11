# Exemples d'utilisation de ScreenCaptureKit pour Node.js

Ce dossier contient des exemples d'utilisation de la bibliothèque `screencapturekit` pour Node.js, qui permet d'enregistrer l'écran sur macOS avec les APIs natives d'Apple.

## Prérequis

- macOS 10.13 (High Sierra) ou version ultérieure
- Node.js 14 ou version ultérieure
- La bibliothèque `screencapturekit` installée (sera utilisée depuis le dossier parent)

## Installation

Pour installer les dépendances des exemples:

```bash
cd example
npm install
```

## Exemples inclus

### 1. Exemple simple d'enregistrement d'écran

Un exemple basique qui montre comment démarrer et arrêter un enregistrement d'écran.

```bash
npm start
```

### 2. Exemple avec modules ES

Un exemple utilisant les imports ES avec quelques options personnalisées.

```bash
npm run start:esm
```

### 3. Lister les périphériques disponibles

Un utilitaire pour lister tous les écrans, périphériques audio et microphones disponibles.

```bash
npm run list-devices
```

### 4. Exemple avancé

Un exemple plus complexe qui montre comment utiliser différentes options comme:
- Sélection d'un écran spécifique
- Capture d'une région spécifique de l'écran
- Activation du HDR (si disponible)
- Configuration personnalisée (FPS, curseur, mise en évidence des clics)

```bash
npm run advanced
```

## Fonctionnalités démontrées

- Capture d'écran basique
- Sélection d'écran spécifique
- Capture d'une région spécifique
- Options d'affichage du curseur et de mise en évidence des clics
- Support HDR (sur macOS 13+)
- Différents codecs vidéo
- Énumération des périphériques audio et des écrans

## Remarques

- Les fichiers d'enregistrement sont sauvegardés dans un dossier temporaire
- Certaines fonctionnalités comme la capture de microphone ne sont disponibles que sur macOS 14 (Sonoma) ou version ultérieure
- Le support HDR n'est disponible que sur macOS 13 (Ventura) ou version ultérieure 