import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type, ThinkingLevel } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ override: true });

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(cors());
  app.use(express.json());

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is missing. Server features relying on GenAI will fail.");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey || "" });

  // Gemini API Proxy endpoints to secure the key
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
                type: Type.OBJECT,
                properties: {
                  tab: { type: Type.STRING, enum: ["obd", "damage", "gps", "maintenance"], description: "Tab to switch to" }
                },
                required: ["tab"]
              }
            },
            {
              name: "setNavigation",
              description: "Set the navigation route from and to locations",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  from: { type: Type.STRING, description: "Starting location" },
                  to: { type: Type.STRING, description: "Destination location" }
                },
                required: ["from", "to"]
              }
            },
            {
              name: "diagnoseVehicle",
              description: "Run an AI diagnostic check on the vehicle's current health",
              parameters: { type: Type.OBJECT, properties: {} }
            },
            {
              name: "toggleRecording",
              description: "Start or stop trip data recording",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING, enum: ["start", "stop"], description: "Whether to start or stop recording" }
                },
                required: ["action"]
              }
            }
          ]
        },
        { googleSearch: {} }
      ];

      const systemInstruction = `You are an expert automotive diagnostics AI and automotive route optimisation AI. You give driving directions in real-time on a gps map.
When possible: recommend alternate routes based on logged trip data, obd2 data and damage scores.
You also diagnose vehicles using trip logs and obd2 live data with fault codes.
Analyse the provided OBD-II sensor data and give a concise, actionable report: identify any anomalies, likely causes, and recommended actions. Use plain English, avoid jargon, and keep the response under 300 words.
Use trip logs in conjunction with OBD2 data and stored historical data of the user combined with web data to diagnose the vehicle. Parse all forums, websites and data at your disposal.
Given historical route data including damage scores and distances, recommend the best route and explain why briefly (under 150 words).
You will always: Use short and concise answers yes and no when possible. Do NOT introduce yourself or use any intro greeting. Complete request within a 99% accuracy.
You can help the user change tabs, set navigation, diagnose the vehicle, and toggle recording.
Vehicle Model: ${contextData?.vehicleModel || 'Unknown'}.
If they ask for their current speed or RPM, answer them directly based on this context:
Current Speed: ${contextData?.speed ? Math.round(contextData.speed * 0.621371) : 0} mph.
Current RPM: ${contextData?.rpm || 0}.
Recording Status: ${contextData?.isRecording ? 'Recording' : 'Not recording'}.
When the user says "Show me my maintenance tasks", use the changeTab tool with "maintenance".
When they say "Start recording" or "Stop recording", use the toggleRecording tool.`;

      let formattedHistory = [];
      if (history && Array.isArray(history)) {
        formattedHistory = history.map((msg: any) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }));
      }
      formattedHistory.push({ role: 'user', parts: [{ text }] });

      const response = await ai.models.generateContent({
        model,
        contents: formattedHistory,
        config: { 
          tools: tools as any,
          systemInstruction,
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });

      res.json({ text: response.text, functionCalls: response.functionCalls });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/diagnose", async (req, res) => {
    try {
      const { data, sensorHistory, vehicleModel } = req.body;
      const model = "gemini-3.1-pro-preview";
      
      const vehicleContext = vehicleModel ? `Vehicle Model: ${vehicleModel}` : `Vehicle Model: Unknown`;

      const sensorContext = sensorHistory && sensorHistory.length > 0 
        ? `Recent Sensor Activity (last 60s):
           - Peak Acceleration: ${Math.max(...sensorHistory.map((h: any) => h.accel)).toFixed(2)}G
           - Peak Rotation Rate: ${Math.max(...sensorHistory.map((h: any) => h.gyro)).toFixed(2)} deg/s
           - Average Vibration Level: ${(sensorHistory.reduce((acc: number, h: any) => acc + h.accel, 0) / sensorHistory.length).toFixed(3)}G`
        : "No recent sensor data available.";

      const prompt = `You are an automotive diagnostic specialist.
      Diagnose vehicles using all data available on the web. Complete request within a 99% accuracy.
      Analyze the following high-fidelity telemetry to provide a diagnostic report with 99% accuracy.
      
      ${vehicleContext}

      OBD-II LIVE DATA:
      - RPM: ${data.rpm}
      - Speed: ${Math.round(data.speed * 0.621371)} mph
      - Engine Coolant Temperature: ${Math.round((data.coolantTemp * 9/5) + 32)} °F
      - Calculated Engine Load: ${data.load.toFixed(1)}%
      - Throttle Position: ${data.throttlePos.toFixed(1)}%
      - Battery System Voltage: ${data.voltage.toFixed(2)}V
      - Active DTCs: ${data.dtcs.length > 0 ? data.dtcs.join(', ') : 'None detected'}
      
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
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          tools: [{ googleSearch: {} }]
        }
      });
      res.json({ text: response.text });
    } catch (e: any) {
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/route", async (req, res) => {
    try {
      const { trips } = req.body;
      if (trips.length < 2) return res.json({ text: "Not enough trip data for recommendations." });
      
      const model = "gemini-3.5-flash";
      const tripSummary = trips.map((t: any) => ({
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
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Setup WebSocket server for Gemini Live API
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on("connection", async (clientWs) => {
    console.log("WebSocket connected to /live");
    
    let session: any = null;
    let messageQueue: any[] = [];
    let isReady = false;

    clientWs.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (!isReady || !session) {
          messageQueue.push(parsed);
          return;
        }
        if (parsed.audio) {
          session.sendRealtimeInput({ audio: { mimeType: "audio/pcm;rate=16000", data: parsed.audio } });
        }
        if (parsed.text) {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: parsed.text }] }],
            turnComplete: true
          });
        }
        if (parsed.toolResponse) {
          session.sendToolResponse(parsed.toolResponse);
        }
      } catch (err) {
        console.error("Live API WS message error:", err);
      }
    });

    try {
      // Fast ping to check API key billing status
      await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: "ping"
      });
    } catch (e: any) {
      console.error("API Key check failed:", e.message);
      clientWs.send(JSON.stringify({ error: "API Error: " + (e.message || "Credits depleted.") }));
      clientWs.close();
      return;
    }

    try {
      const connectPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: { parts: [{ text: "You are Drive-Logic, an expert automotive diagnostics AI and automotive route optimisation AI. Your very first message must ALWAYS be EXACTLY: 'Hi, I'm Drive-Logic! How can I assist you today?'. You speak with an English woman's accent. You give driving directions in real-time on a gps map. When possible: recommend alternate routes based on logged trip data, obd2 data and damage scores. You also diagnose vehicles using trip logs and obd2 live data with fault codes. Analyse the provided OBD-II sensor data and give a concise, actionable report: identify any anomalies, likely causes, and recommended actions. Use plain English, avoid jargon, and keep the response under 300 words. Use trip logs in conjunction with OBD2 data and stored historical data of the user combined with web data to diagnose the vehicle. Parse all forums, websites and data at your disposal. Given historical route data including damage scores and distances, recommend the best route and explain why briefly. You will always: Use short and concise answers yes and no when possible. Complete request within a 99% accuracy." }] },
          tools: [
            {
              functionDeclarations: [
                {
                  name: "changeTab",
                  description: "Change the current application tab",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      tab: { type: Type.STRING, enum: ["obd", "damage", "gps", "maintenance"], description: "Tab to switch to" }
                    },
                    required: ["tab"]
                  }
                },
                {
                  name: "setNavigation",
                  description: "Set the navigation route from and to locations",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      from: { type: Type.STRING, description: "Starting location" },
                      to: { type: Type.STRING, description: "Destination location" }
                    },
                    required: ["from", "to"]
                  }
                },
                {
                  name: "diagnoseVehicle",
                  description: "Run an AI diagnostic check on the vehicle's current health",
                  parameters: { type: Type.OBJECT, properties: {} }
                },
                {
                  name: "toggleRecording",
                  description: "Start or stop trip data recording",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING, enum: ["start", "stop"], description: "Whether to start or stop recording" }
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
          onmessage: (message: LiveServerMessage) => {
            console.log("Got Live API message:", Object.keys(message));
            const serverContent = message.serverContent as any;
            
            // Forward audio parts
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
            
            // Forward user speech transcription if available
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
          },
        },
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Connection to Gemini Live API timed out (credits may be depleted).")), 5000);
      });

      session = await Promise.race([connectPromise, timeoutPromise]) as any;

      isReady = true;
      clientWs.send(JSON.stringify({ ready: true }));

      while (messageQueue.length > 0) {
        const parsed = messageQueue.shift();
        if (parsed.audio) {
          session.sendRealtimeInput({ audio: { mimeType: "audio/pcm;rate=16000", data: parsed.audio } });
        }
        if (parsed.text) {
          session.sendClientContent({
            turns: [{ role: "user", parts: [{ text: parsed.text }] }],
            turnComplete: true
          });
        }
        if (parsed.toolResponse) {
          session.sendToolResponse(parsed.toolResponse);
        }
      }

      clientWs.on("close", () => {
        console.log("Client disconnected");
      });
    } catch (err: any) {
      console.error("Failed to connect to Live API:", err);
      clientWs.send(JSON.stringify({ error: err.message || "Failed to connect to Live API" }));
    }
  });
}

startServer();
