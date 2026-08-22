<div align="center">
  <img src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" alt="Drive Logic AI Banner" width="800"/>
  <h1>Drive Logic AI 🏎️🧠</h1>
  <p><b>Real-time vehicle hardware telemetry blended with low-latency Gemini AI voice intelligence.</b></p>
</div>

## Overview

**Drive Logic AI** is a next-generation diagnostic and telematics application. It actively blends real-time smartphone hardware telemetry (such as Accelerometer and IMU data) with ultra-low-latency, bidirectional voice streaming powered by Google's Gemini models via WebSockets. It acts as an intelligent co-pilot that can diagnose vehicle issues, assess trip safety (e.g., pothole damage, sudden braking), and provide conversational AI feedback while driving.

## ✨ Key Features

- **Real-Time Telemetry Pipeline:** Captures device IMU/Accelerometer data at high frequencies to detect motion anomalies like rough road vibrations or hard braking.
- **Low-Latency Bidirectional Voice Streaming:** Powered by Google's Gemini Multimodal models for fluid conversational diagnostics without buffering stutter.
- **Edge-to-Edge UI (Android 15):** A modern, immersive UI built with Jetpack Compose & Capacitor, optimized for Android SDK 35 with system inset handling.
- **Cloud-Backed Diagnostics:** Stores trip data and diagnostic events safely in the cloud via Firebase/Firestore.
- **Automated CI/CD:** Fully automated GitHub Actions workflow for generating optimized AABs and deploying to the Google Play Store (Internal & Production tracks).

## 🛠️ Tech Stack

- **Frontend:** Web Components wrapped natively using **Capacitor**
- **Native Layer:** Kotlin, Android SDK, Jetpack Compose
- **AI / LLM:** Google Gemini API (Streaming via WebSockets)
- **Backend/DB:** Firebase Firestore
- **CI/CD:** GitHub Actions, Dependabot

## 🚀 Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v16+)
- [Android Studio](https://developer.android.com/studio) (for Native Android builds)
- Java JDK 17

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/DriveLogicAI_CHAT.git
   cd DriveLogicAI_CHAT
   ```

2. **Install web dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file (or rename `.env.example`) and add your Gemini API key:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```

4. **Run the local development server:**
   ```bash
   npm run dev
   ```

### 📱 Android Development & Build Flavors

The project utilizes Gradle build flavors to safely isolate live sensor data from mocked data during development:
- **`dev` Flavor:** Injects mock synthetic accelerometer waves (simulated potholes, hard braking) to test the UI and logic without being in a moving vehicle.
- **`prod` Flavor:** Hooks directly into `SensorManager` with live production endpoints.

To build or run the Android project:
```bash
npx cap sync android
npx cap open android
```
*(Or open `android/` directly in Android Studio)*

## ☁️ CI/CD & Automated Releases

We use GitHub Actions (`.github/workflows/deploy.yml`) to ensure rapid, secure deployments directly to the Google Play Console:

- **Pushes to `main`:** Automatically compiles the release build and pushes the Android App Bundle (`.aab`) and R8 mapping files to the **Google Play Internal Track** for QA.
- **Tagged Releases (`v*.*.*`):** Compiles the optimized Production App Bundle and promotes it straight to the **Google Play Production Track**.
- **Automated Dependency Updates:** Maintained via Dependabot (`.github/dependabot.yml`) for npm, Gradle, and Actions.

*(Note: API keys and Keystore files are securely injected via GitHub Repository Secrets during the build phase to protect Google AI Studio and GCP credentials.)*

## 🔒 Security & Optimization

- **ProGuard / R8:** Release builds are aggressively minified and resource-shrunk. Telemetry payload schemas are preserved using `@Keep` rules to prevent JSON serialization crashes.
- **Decoupled Architecture:** Sensor polling runs on high-throughput Kotlin Coroutines (`Dispatchers.Default`) completely detached from the Gemini audio streaming buffers to prevent any UI thread lag or voice stutter.

---
*Built with ❤️ using Capacitor, Firebase, and Google Gemini.*
