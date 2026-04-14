import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import FormData from "form-data";
import cors from "cors";

const app = express();

app.use(cors());

const upload = multer({ dest: "uploads/" });

// ?? MEMORIA TEMPORANEA
let queue = [];
let results = {};

// ? Test server
app.get("/", (req, res) => {
  res.send("Server attivo ??");
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ?? DUEL
app.post("/duel", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Audio mancante" });
    }

    // ?? Trascrizione
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

    if (!transcriptData.text) {
      return res.status(500).json({ error: "Errore trascrizione" });
    }

    const userText = transcriptData.text;

    console.log("?? UTENTE:", userText);

    // ?? CODA
    if (queue.length === 0) {
      const id = Date.now().toString();

      queue.push({ id, text: userText });

      return res.json({
        status: "waiting",
        id: id,
        message: "? In attesa di un avversario..."
      });
    }

    // ?? MATCH
    const opponent = queue.shift();
    const matchId = opponent.id;

    console.log("?? MATCH TROVATO");

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
            content: "Sei un giudice esperto. Devi valutare un duello tra Utente e Avversario. NON sono ammessi pareggi. Devi generare DUE messaggi diversi. Rispondi ESATTAMENTE così: VINCITORE: Utente o Avversario. MESSAGGIO_VINCITORE: complimenti e perché ha vinto. MESSAGGIO_PERDENTE: feedback su cosa migliorare."
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

    console.log("?? RISPOSTA AI:", resultText);

    // ?? PARSE CORRETTO
    let winner = "Sconosciuto";
    let messageWinner = "";
    let messageLoser = "";

    if (resultText.includes("VINCITORE: Utente")) {
      winner = "Utente";
    } else if (resultText.includes("VINCITORE: Avversario")) {
      winner = "Avversario";
    }

    const matchWinner = resultText.match(/MESSAGGIO_VINCITORE:\s*([\s\S]*?)MESSAGGIO_PERDENTE:/);
    const matchLoser = resultText.match(/MESSAGGIO_PERDENTE:\s*([\s\S]*)/);

    if (matchWinner) messageWinner = matchWinner[1].trim();
    if (matchLoser) messageLoser = matchLoser[1].trim();

    // fallback sicurezza
    if (!messageWinner) messageWinner = "Hai vinto!";
    if (!messageLoser) messageLoser = "Puoi migliorare!";

    // ?? RISULTATI PERSONALIZZATI
    if (winner === "Utente") {
      results[matchId] = {
        waiting: {
          winner: "Avversario",
          message: messageLoser
        },
        new: {
          winner: "Utente",
          message: messageWinner
        }
      };
    } else {
      results[matchId] = {
        waiting: {
          winner: "Utente",
          message: messageWinner
        },
        new: {
          winner: "Avversario",
          message: messageLoser
        }
      };
    }

    // ? RISPOSTA PER CHI ARRIVA DOPO
    res.json({
      status: "matched",
      result: "DUELLO COMPLETATO",
      winner: results[matchId].new.winner,
      message: results[matchId].new.message
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
      ...result.waiting
    });
  }

  res.json({ status: "waiting" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("?? Server running on port", PORT);
});