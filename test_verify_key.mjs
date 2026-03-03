import { GoogleGenAI } from '@google/genai';

async function check() {
  try {
    const genAI = new GoogleGenAI({ apiKey: "test-fake-key" });
    const modelListResult = await genAI.models.list();
    for await (const model of modelListResult) {
      console.log(model.name);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}
check();
