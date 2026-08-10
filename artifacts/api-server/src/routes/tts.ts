import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Library voice (wJqPPQ618aTW29mptyoc) requires a paid ElevenLabs plan.
// Using Rachel — warm, natural female voice included on all plans.
// Swap back to the original voice ID once the plan is upgraded.
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

router.post("/tts", requireAuth, async (req, res) => {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) {
    req.log.error("ELEVENLABS_API_KEY is not configured");
    res.status(500).json({ error: "TTS not configured" });
    return;
  }

  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.82,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      req.log.error({ status: response.status, body }, "ElevenLabs TTS failed");
      // 402 = plan upgrade required — signal client to fall back to browser TTS
      const code = response.status === 402 ? 402 : 502;
      res.status(code).json({ error: "TTS request failed", code: response.status });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");

    const reader = response.body?.getReader();
    if (!reader) {
      res.status(502).json({ error: "No response body from TTS" });
      return;
    }

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (err) {
    req.log.error({ err }, "TTS stream error");
    if (!res.headersSent) res.status(502).json({ error: "TTS stream error" });
  }
});

export default router;
