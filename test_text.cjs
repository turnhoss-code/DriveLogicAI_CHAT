const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});
async function run() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: "Hello"
    });
    console.log("Success text API:", res.text);
  } catch (err) {
    console.error(err.message);
  }
}
run();
