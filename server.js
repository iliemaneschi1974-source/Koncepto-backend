import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";

const app = express();

// ?? QUESTA RIGA DEVE ESSERE QUI
app.use(cors());
const upload = multer({ dest: "uploads/" });
app.get("/", (req, res) => {
  res.send("Server attivo ??");
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/duel", upload.single("audio"), async (req, res) => {
  try {
    console.log("Richiesta ricevuta");

    // ? controllo fondamentale
    if (!req.file) {
      console.log("? Nessun file ricevuto");
      return res.status(400).json({ error: "Audio mancante" });
    }

    console.log("? File ricevuto:", req.file.path);

    // ?? Trascrizione
    const form = new FormData();
    form.append("file", fs.createReadStream(req.file.path));
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

    if (!transcriptData.text) {
      return res.status(500).json({
        error: "Errore trascrizione",
        data: transcriptData
      });
    }

    const userText = transcriptData.text;

    // ?? Risposta AI
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
    const aiText = aiData.choices?.[0]?.message?.content || "Errore AI";

    // ?? Giudice
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
    const resultText = judgeData.choices?.[0]?.message?.content || "Errore giudizio";

    res.json({
      result: "DUELLO COMPLETATO",
      reason: resultText
    });

  } catch (err) {
    console.error("ERRORE SERVER:", err);

    res.status(500).json({
      error: "Errore server",
      details: err.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});