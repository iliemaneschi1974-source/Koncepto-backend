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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/duel", upload.single("audio"), async (req, res) => {
  try {
    // ?? Trascrizione
    const form = new FormData();
    form.append("file", fs.createReadStream(req.file.path));
    form.append("model", "gpt-4o-mini-transcribe");

    const transcriptRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

    const transcriptData = await transcriptRes.json();
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
          { role: "system", content: "Sei carismatico, diretto e dominante." },
          { role: "user", content: userText }
        ]
      })
    });

    const aiData = await aiRes.json();
    const aiText = aiData.choices[0].message.content;

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
            content: "Sei un giudice duro e diretto. Decidi chi ha vinto."
          },
          {
            role: "user",
            content: `Utente: ${userText}\nAvversario: ${aiText}`
          }
        ]
      })
    });

    const judgeData = await judgeRes.json();
    const resultText = judgeData.choices[0].message.content;

    res.json({
      result: "DUELLO COMPLETATO",
      reason: resultText
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Errore server");
  }
});

app.listen(3000, () => console.log("Server running"));