var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_ws = require("ws");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config({ override: true });
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is missing. Server features relying on GenAI will fail.");
  }
  const ai = new import_genai.GoogleGenAI({ apiKey: apiKey || "" });
  app.get("/api/keytest", (req, res) => {
    res.json({ key: process.env.GEMINI_API_KEY });
  });
  app.post("/api/gemini/command", async (req, res) => {
    try {
      const { text, history, contextData } = req.body;
      const model = "gemini-3.5-flash";
      const tools = [
        {
          functionDeclarations: [
            {
              name: "changeTab",
              description: "Change the current application tab",
              parameters: {
                type: import_genai.Type.OBJECT,
                properties: {
                  tab: { type: import_genai.Type.STRING, enum: ["obd", "damage", "gps", "maintenance"], description: "Tab to switch to" }
                },
                required: ["tab"]
              }
            },
            {
              name: "setNavigation",
              description: "Set the navigation route from and to locations",
              parameters: {
                type: import_genai.Type.OBJECT,
                properties: {
                  from: { type: import_genai.Type.STRING, description: "Starting location" },
                  to: { type: import_genai.Type.STRING, description: "Destination location" }
                },
                required: ["from", "to"]
              }
            },
            {
              name: "diagnoseVehicle",
              description: "Run an AI diagnostic check on the vehicle's current health",
              parameters: { type: import_genai.Type.OBJECT, properties: {} }
            },
            {
              name: "toggleRecording",
              description: "Start or stop trip data recording",
              parameters: {
                type: import_genai.Type.OBJECT,
                properties: {
                  action: { type: import_genai.Type.STRING, enum: ["start", "stop"], description: "Whether to start or stop recording" }
                },
                required: ["action"]
              }
            }
          ]
        },
        { googleSearch: {} }
      ];
      const systemInstruction = `You are an automotive diagnostic specialist who gives driving directions in real-time on a gps map. When possible: recommend alternate routes based on logged trip data, obd2 data and damage scores. You also diagnose vehicles using trip logs and obd2 live data with fault codes.
You will always: Use short and concise answers when talking in chat with users. Diagnose vehicles using all data available on the web. Complete request within a 99% accuracy.
You can help the user change tabs, set navigation, diagnose the vehicle, and toggle recording.
Vehicle Model: ${contextData?.vehicleModel || "Unknown"}.
If they ask for their current speed or RPM, answer them directly based on this context:
Current Speed: ${contextData?.speed ? Math.round(contextData.speed * 0.621371) : 0} mph.
Current RPM: ${contextData?.rpm || 0}.
Recording Status: ${contextData?.isRecording ? "Recording" : "Not recording"}.
When the user says "Show me my maintenance tasks", use the changeTab tool with "maintenance".
When they say "Start recording" or "Stop recording", use the toggleRecording tool.`;
      let formattedHistory = [];
      if (history && Array.isArray(history)) {
        formattedHistory = history.map((msg) => ({
          role: msg.sender === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        }));
      }
      formattedHistory.push({ role: "user", parts: [{ text }] });
      const response = await ai.models.generateContent({
        model,
        contents: formattedHistory,
        config: {
          tools,
          systemInstruction,
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });
      res.json({ text: response.text, functionCalls: response.functionCalls });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/gemini/diagnose", async (req, res) => {
    try {
      const { data, sensorHistory, vehicleModel } = req.body;
      const model = "gemini-3.1-pro-preview";
      const vehicleContext = vehicleModel ? `Vehicle Model: ${vehicleModel}` : `Vehicle Model: Unknown`;
      const sensorContext = sensorHistory && sensorHistory.length > 0 ? `Recent Sensor Activity (last 60s):
           - Peak Acceleration: ${Math.max(...sensorHistory.map((h) => h.accel)).toFixed(2)}G
           - Peak Rotation Rate: ${Math.max(...sensorHistory.map((h) => h.gyro)).toFixed(2)} deg/s
           - Average Vibration Level: ${(sensorHistory.reduce((acc, h) => acc + h.accel, 0) / sensorHistory.length).toFixed(3)}G` : "No recent sensor data available.";
      const prompt = `You are an automotive diagnostic specialist.
      Diagnose vehicles using all data available on the web. Complete request within a 99% accuracy.
      Analyze the following high-fidelity telemetry to provide a diagnostic report with 99% accuracy.
      
      ${vehicleContext}

      OBD-II LIVE DATA:
      - RPM: ${data.rpm}
      - Speed: ${Math.round(data.speed * 0.621371)} mph
      - Engine Coolant Temperature: ${Math.round(data.coolantTemp * 9 / 5 + 32)} \xB0F
      - Calculated Engine Load: ${data.load.toFixed(1)}%
      - Throttle Position: ${data.throttlePos.toFixed(1)}%
      - Battery System Voltage: ${data.voltage.toFixed(2)}V
      - Active DTCs: ${data.dtcs.length > 0 ? data.dtcs.join(", ") : "None detected"}
      
      IMU SENSOR DATA (Smartphone Accelerometer/Gyro):
      ${sensorContext}
      
      TASK:
      1. Provide a "Vehicle Health Index" (0-100%).
      2. Perform a "System Check" on Engine, Battery, and Driving Behavior.
      3. Correlate OBD data with Sensor data (e.g., does high RPM correlate with harsh sensor events?).
      4. Offer specific actionable maintenance advice if needed.
      
      Keep the tone professional, technical yet accessible, and concise. Use Markdown.`;
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: import_genai.ThinkingLevel.HIGH },
          tools: [{ googleSearch: {} }]
        }
      });
      res.json({ text: response.text });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/gemini/dtc", async (req, res) => {
    try {
      const { code } = req.body;
      const model = "gemini-3.5-flash";
      const prompt = `You are an expert automotive diagnostics AI. Provide a concise, plain English explanation of the OBD-II Diagnostic Trouble Code (DTC) ${code}. Include the likely causes and recommended actions. Keep the response under 150 words.`;
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      res.json({ text: response.text });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/gemini/route", async (req, res) => {
    try {
      const { trips } = req.body;
      if (trips.length < 2) return res.json({ text: "Not enough trip data for recommendations." });
      const model = "gemini-3.5-flash";
      const tripSummary = trips.map((t) => ({
        damage: t.averageDamageScore,
        distance: t.distance,
        events: t.events.length
      }));
      const prompt = `Based on the following recent driving history, provide a brief route optimization recommendation to reduce vehicle wear and tear.
      Trips: ${JSON.stringify(tripSummary)}
      
      Also, provide 1-3 proactive alerts for upcoming harsh driving conditions or inefficient routes based on this data. Use Markdown.`;
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }]
        }
      });
      res.json({ text: response.text });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  const wss = new import_ws.WebSocketServer({ server, path: "/live" });
  wss.on("connection", async (clientWs) => {
    console.log("WebSocket connected to /live");
    try {
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [import_genai.Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: "You are an automotive diagnostic specialist who gives driving directions in real-time on a gps map. When possible: recommend alternate routes based on logged trip data, obd2 data and damage scores. You also diagnose vehicles using trip logs and obd2 live data with fault codes. You will always: Use short and concise answers when talking in chat with users. Diagnose vehicles using all data available on the web. Complete request within a 99% accuracy.",
          tools: [
            {
              functionDeclarations: [
                {
                  name: "changeTab",
                  description: "Change the current application tab",
                  parameters: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      tab: { type: import_genai.Type.STRING, enum: ["obd", "damage", "gps", "maintenance"], description: "Tab to switch to" }
                    },
                    required: ["tab"]
                  }
                },
                {
                  name: "setNavigation",
                  description: "Set the navigation route from and to locations",
                  parameters: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      from: { type: import_genai.Type.STRING, description: "Starting location" },
                      to: { type: import_genai.Type.STRING, description: "Destination location" }
                    },
                    required: ["from", "to"]
                  }
                },
                {
                  name: "diagnoseVehicle",
                  description: "Run an AI diagnostic check on the vehicle's current health",
                  parameters: { type: import_genai.Type.OBJECT, properties: {} }
                },
                {
                  name: "toggleRecording",
                  description: "Start or stop trip data recording",
                  parameters: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      action: { type: import_genai.Type.STRING, enum: ["start", "stop"], description: "Whether to start or stop recording" }
                    },
                    required: ["action"]
                  }
                }
              ]
            },
            { googleSearch: {} }
          ]
        },
        callbacks: {
          onmessage: (message) => {
            const serverContent = message.serverContent;
            const parts = serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
                if (part.text) {
                  clientWs.send(JSON.stringify({ text: part.text }));
                }
              }
            }
            const userParts = serverContent?.userTurn?.parts;
            if (userParts) {
              for (const part of userParts) {
                if (part.text) {
                  clientWs.send(JSON.stringify({ userText: part.text }));
                }
              }
            }
            if (serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
            if (message.toolCall) {
              clientWs.send(JSON.stringify({ toolCall: message.toolCall }));
            }
          }
        }
      });
      clientWs.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" }
            });
          }
          if (parsed.toolResponse) {
            session.sendToolResponse(parsed.toolResponse);
          }
          if (parsed.text) {
            session.sendClientContent({ turns: parsed.text });
          }
        } catch (err) {
          console.error("Live API WS message error:", err);
        }
      });
      clientWs.on("close", () => {
        console.log("Client disconnected");
      });
    } catch (err) {
      console.error("Failed to connect to Live API:", err);
      clientWs.send(JSON.stringify({ error: err.message || "Failed to connect to Live API" }));
    }
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
