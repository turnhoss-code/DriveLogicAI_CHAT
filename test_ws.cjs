require('dotenv').config();
async function run() {
  const ws = new (require('ws'))('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + process.env.GEMINI_API_KEY);
  ws.on('open', () => {
    ws.send(JSON.stringify({
      setup: {
        model: "models/gemini-omni-flash-preview"
      }
    }));
  });
  ws.on('message', data => console.log("WS msg:", data.toString().substring(0, 100)));
  ws.on('error', err => console.log("WS err:", err));
  ws.on('close', (code, reason) => console.log("WS close:", code, reason.toString()));
}
run();
