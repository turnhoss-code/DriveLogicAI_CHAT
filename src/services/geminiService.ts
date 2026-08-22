const getBaseUrl = () => window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '' : 'https://drivelogicai-chat.onrender.com';

import { OBDData, Trip } from "../types";

export const processVoiceCommand = async (text: string, contextData?: { speed: number, rpm: number, isRecording: boolean, vehicleModel?: string }, history?: any[]) => {
  try {
    const res = await fetch(`${getBaseUrl()}/api/gemini/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, contextData, history })
    });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Voice command processing failed:", error);
    return { text: "I'm sorry, I couldn't process that command. Please check your connection." };
  }
};

export const runAIDiagnosis = async (data: OBDData, sensorHistory?: { accel: number, gyro: number, timestamp: number }[], vehicleModel?: string) => {
  try {
    const res = await fetch(`${getBaseUrl()}/api/gemini/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, sensorHistory, vehicleModel })
    });
    const json = await res.json();
    return json.text || "AI Diagnosis is currently unavailable.";
  } catch (error) {
    console.error("AI Diagnosis failed:", error);
    return "AI Diagnosis is currently unavailable. Please check your API key.";
  }
};

export const fetchDTCDefinition = async (code: string) => {
  try {
    const res = await fetch(`${getBaseUrl()}/api/gemini/dtc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const json = await res.json();
    return json.text || null;
  } catch (error) {
    console.error("DTC Definition fetch failed:", error);
    return null; // Return null so we can fallback to local definitions if needed
  }
};

export const getRouteRecommendation = async (trips: Trip[]) => {
  try {
    const res = await fetch(`${getBaseUrl()}/api/gemini/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips })
    });
    const json = await res.json();
    return json.text;
  } catch (error) {
    console.error("Route recommendation failed:", error);
    return "Route recommendations are currently unavailable.";
  }
};
