import express from "express";
import cors from "cors";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Toffa backend is running 🚀");
});

app.post("/generate-preview", async (req, res) => {
  try {
    const { text } = req.body;
    console.log("TEXT:", text);

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "fail" });
  }
});


    const prompt = `
Create ONE single modern comic-style cartoon image.

Each generated image should have a slightly different pose and expression.

Scene: Couple in a cosy home setting.

Characters:
- Female: arms crossed, slightly annoyed but warm
- Male: confused, adjusting hearing aid
- Use uploaded face references

Speech bubble (female):
"${text}"

Include:
- Behind-the-ear hearing aid (Oticon style)

Tone:
Light, playful humour

Requirements:
- Square (1:1)
- Clean composition
- Watermark "created at toffa.ai"
`;

    const result = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt,
      size: "1024x1024",
      n: 3
    });

    // Extract base64 images
    const images = result.data.map(img => img.b64_json);

    res.json({ images });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image generation failed"});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
