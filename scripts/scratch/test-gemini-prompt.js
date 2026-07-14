import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testGenAI() {
    const article = {
        title: "S&P 500 futures rise as traders bet on tech rally",
        publisher: "Yahoo Finance"
    };

    const isChinese = true;
    const prompt = `Analyze this financial news headline and short summary:
TITLE: ${article.title}
SUMMARY: ${article.publisher}
Link to article publisher for context.

TASK:
1. Determine if the sentiment is strictly BULLISH, BEARISH, or NEUTRAL.
2. ${isChinese ? 'Translate the original TITLE to Traditional Chinese (繁體中文). Keep it professional and punchy.' : 'Refine the original TITLE for clarity if needed.'}
3. Write a strict 30-word max summary of how this news impacts the US or Global market${isChinese ? ' in Traditional Chinese (繁體中文)' : ''}.

OUTPUT FORMAT (strictly follow this, 3 lines):
[SENTIMENT]
[TITLE]
[SUMMARY]

Example:
${isChinese ? '看漲\n標普 500 指數因科技股走強而看漲\n科技巨頭的強勁業績預計在大盤反彈背景下推動指數走高。' : 'BULLISH\nS&P 500 Bullish on Tech Strength\nStrong earnings from tech giants are expected to drive the index higher amidst a broader market rally.'}
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-latest',
        contents: prompt,
    });

    const text = response.text || "";
    console.log("--- RAW RESPONSE ---");
    console.log(text);
    console.log("--------------------");

    const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    console.log("Parsed Lines:", lines);
}

testGenAI().catch(console.error);
