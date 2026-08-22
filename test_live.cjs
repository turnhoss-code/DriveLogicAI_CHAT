require('dotenv').config();
const { GoogleGenAI, Modality } = require('@google/genai');
const ai = new GoogleGenAI({});
async function run() {
  console.log("Connecting...");
  try {
    const session = await ai.live.connect({
      model: "gemini-2.0-flash",
      config: { responseModalities: [Modality.AUDIO] },
    });
    console.log("Connected!");
    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Hello!' }] }], turnComplete: true });
    
    // listen
    for await (const message of session) {
      console.log("msg:", Object.keys(message));
      break;
    }
  } catch (err) {
    console.error("Connect error:", err);
  }
  process.exit(0);
}
run();
