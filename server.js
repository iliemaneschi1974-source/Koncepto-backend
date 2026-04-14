import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";

const app = express();

app.use(cors());

const upload = multer({ dest: "uploads/" });

// ? Route base (test server)
app.get("/", (req, res) => {
  res.send("Server attivo ??");
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/duel", upload.single("audio"), async (req, res) => {
  try {
    console.log("?? Richiesta ricevuta");

    // ? Controllo file
    if (!req.file) {
      console.log("? Nessun file ricevuto");
      return res.status(400).json({ error: "Audio mancante" });
    }

    console.log("? File ricevuto:", req.file.path);
    console.log("?? API KEY:", OPENAI_API_KEY ? "OK" : "MANCANTE");

    // ?? TRASCRIZIONE
    const form = new FormData();
    form.append("file", fs.createReadStream(req.file.path), {
  filename: "audio.webm",
  contentType: "audio/webm"
});
    form.append("model", "gpt-4o-mini-transcribe");

    const transcriptRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...form.getHeaders()
      },
      body: form
    });

    const transcriptData = await transcriptRes.json();
    console.log("?? TRANSCRIPT DATA:", transcriptData);

    if (!transcriptData.text) {
      return res.status(500).json({
        error: "Errore trascrizione",
        data: transcriptData
      });
    }

    const userText = transcriptData.text;

    // ?? RISPOSTA AI
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Sei carismatico e dominante." },
          { role: "user", content: userText }
        ]
      })
    });

    const aiData = await aiRes.json();
    console.log("?? AI DATA:", aiData);

    const aiText = aiData.choices?.[0]?.message?.content || "Errore AI";

    // ?? GIUDICE
    const judgeRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Decidi chi ha vinto. Risposta breve."
          },
          {
            role: "user",
            content: `Utente: ${userText}\nAvversario: ${aiText}`
          }
        ]
      })
    });

    const judgeData = await judgeRes.json();
    console.log("?? JUDGE DATA:", judgeData);

    const resultText = judgeData.choices?.[0]?.message?.content || "Errore giudizio";

    // ? RISPOSTA FINALE
    res.json({
      result: "DUELLO COMPLETATO",
      reason: resultText
    });

  } catch (err) {
    console.error("?? ERRORE SERVER:", err);

    res.status(500).json({
      error: "Errore server",
      details: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("?? Server running on port", PORT);
});