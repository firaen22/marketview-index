import { GoogleGenAI } from '@google/genai';

async function check() {
  try {
    // Some character at index 0 > 255
    const badKey = String.fromCharCode(20381) + "testkey";
    console.log("bad key len", badKey.length);
    const genAI = new GoogleGenAI({ apiKey: badKey });
    await genAI.models.list();
  } catch (e) {
    console.error("Error:", e.message);
  }
}
check();
