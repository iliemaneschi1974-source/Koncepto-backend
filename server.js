import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";

const app = express();
app.use(cors());

const upload = multer({ dest: "uploads/" });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ?? MEMORIA
let queue = [];
let results = {};

// TEST
app.get("/", (req, res) => {
  res.send("Server attivo ??");
});

// ?? DUEL
app.post("/duel", upload.single("audio"), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ error: "Audio mancante" });
    }

    // ?? TRASCRIZIONE
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
    const userText = transcriptData.text;

    if (!userText) {
      return res.status(500).json({ error: "Errore trascrizione" });
    }

    console.log("?? UTENTE:", userText);

    // ?? ID utente corrente
    const userId = Date.now().toString();

    // ?? SE NESSUNO IN CODA
    if (queue.length === 0) {

      queue.push({
        id: userId,
        text: userText,
        timestamp: Date.now()
      });

      console.log("? In attesa:", userId);

      return res.json({
        status: "waiting",
        id: userId
      });
    }

    // ?? MATCH
    const opponent = queue.shift();
    const opponentId = opponent.id;

    console.log("?? MATCH:", userId, "vs", opponentId);

    // ?? GIUDICE AI
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
            content: "Sei un giudice esperto. NON sono ammessi pareggi. Rispondi ESATTAMENTE così: VINCITORE: Utente o Avversario. MESSAGGIO_VINCITORE: testo. MESSAGGIO_PERDENTE: testo."
          },
          {
            role: "user",
            content: `Utente: ${userText}\nAvversario: ${opponent.text}`
          }
        ]
      })
    });

    const judgeData = await judgeRes.json();
    const resultText = judgeData.choices?.[0]?.message?.content || "";

    console.log("?? AI:", resultText);

    // ?? PARSE
    let winner = "Utente";

    if (resultText.includes("VINCITORE: Avversario")) {
      winner = "Avversario";
    }

    const winMatch = resultText.match(/MESSAGGIO_VINCITORE:\s*([\s\S]*?)MESSAGGIO_PERDENTE:/);
    const loseMatch = resultText.match(/MESSAGGIO_PERDENTE:\s*([\s\S]*)/);

    let messageWinner = winMatch ? winMatch[1].trim() : "Hai vinto!";
    let messageLoser = loseMatch ? loseMatch[1].trim() : "Puoi migliorare!";

    // ?? SALVATAGGIO RISULTATI (FIX VERO)
    if (winner === "Utente") {

      results[userId] = {
        winner: "Utente",
        message: messageWinner
      };

      results[opponentId] = {
        winner: "Avversario",
        message: messageLoser
      };

    } else {

      results[userId] = {
        winner: "Avversario",
        message: messageLoser
      };

      results[opponentId] = {
        winner: "Utente",
        message: messageWinner
      };
    }

    // ? risposta immediata al nuovo utente
    return res.json({
      status: "matched",
      winner: results[userId].winner,
      message: results[userId].message
    });

  } catch (err) {

    console.error("?? ERRORE:", err);

    res.status(500).json({
      error: "Errore server",
      details: err.message
    });
  }
});

// ?? CHECK
app.get("/check/:id", (req, res) => {

  const id = req.params.id;

  if (results[id]) {

    const result = results[id];
    delete results[id];

    return res.json({
      status: "matched",
      winner: result.winner,
      message: result.message
    });
  }

  res.json({ status: "waiting" });
});

// ?? PULIZIA CODA
setInterval(() => {
  const now = Date.now();
  queue = queue.filter(u => now - u.timestamp < 30000);
}, 5000);

// START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("?? Server running on port", PORT);
});