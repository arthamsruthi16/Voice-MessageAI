import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// CJS-safe root path — works whether bundled to .cjs or run directly with tsx.
// Render/npm always run `node dist/server.cjs` from the project root, so
// process.cwd() reliably points at the project root in both dev and prod.
const projectRoot = process.cwd();

async function startServer() {
  const app = express();

  // Increase payload limit for base64 encoded audio
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Shared Gemini client helper
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Transcription Endpoint
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audio, mimeType, instruction } = req.body;

      if (!audio) {
        return res.status(400).json({ error: 'Audio data is required' });
      }

      if (!apiKey) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY is not configured. Please add your Gemini API Key in Settings > Secrets.' 
        });
      }

      // Convert base64 back to buffer
      const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '');

      const audioPart = {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: base64Data,
        }
      };

      const systemInstruction = "You are an elite, highly accurate audio transcription and text message formatting assistant. Your job is to accurately transcribe the spoken words in the audio file and convert them into beautiful, highly readable, structured, and polished text message templates (Casual SMS, Professional Slack/Email, and a bulleted summary of key points). " + (instruction ? `Additional context or instruction provided by the user: "${instruction}".` : "");

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          audioPart,
          {
            text: "Transcribe this audio precisely and generate formatted message templates according to the requested JSON structure."
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "A short, descriptive 3-5 word title for this voice memo.",
              },
              transcription: {
                type: Type.STRING,
                description: "A highly accurate, word-for-word transcript of the spoken audio. Clean up obvious audio cuts, but keep all original phrases, statements, and specific vocabulary.",
              },
              casualSMS: {
                type: Type.STRING,
                description: "A natural, conversational text message version of the transcription. Formatted for friendly platforms like SMS, iMessage, or WhatsApp. Remove fillers (like um, like, you know), fix grammatical slips, and include 1-2 expressive emojis naturally.",
              },
              professionalMessage: {
                type: Type.STRING,
                description: "A highly polished, clear, professional and polite draft. Formatted as a brief email or Slack update. Uses paragraphs/bullet structures if there are lists, avoids slang/fillers, and maintains an elegant, respectful tone.",
              },
              summary: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
                description: "A list of the core takeaways, actions, next steps, or key highlights from the audio message.",
              }
            },
            required: ["title", "transcription", "casualSMS", "professionalMessage", "summary"],
          }
        }
      });

      if (!response.text) {
        return res.status(500).json({ error: 'Failed to generate transcription' });
      }

      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error: any) {
      console.error('Transcription error:', error);
      res.status(500).json({ 
        error: error.message || 'An error occurred during audio processing and transcription.' 
      });
    }
  });

  // Dev vs Prod Asset Delivery
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(projectRoot, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server started in ${process.env.NODE_ENV || 'development'} mode on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});