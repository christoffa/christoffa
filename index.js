import express from "express";
import cors from "cors";
import OpenAI from "openai";

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadImage = async (base64) => {
  return await cloudinary.uploader.upload(
    `data:image/png;base64,${base64}`,
    {
      folder: "toffa"
    }
  );
};

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
    //const { text } = req.body;
    const text = req.body?.text || "Default text";
    const image_url = req.body?.image_url || "";

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

    //openai.responses.create
    //const result = await openai.images.generate({
    const result = await openai.responses.create({
      model: "gpt-image-1.5",
      prompt,
      size: "1024x1024",
      n: 3,
    
      

    });

    // Extract base64 images
    //const images = result.data.map(img => img.b64_json);
    /*
    const images = result.data.map(img => ({
  base64: img.b64_json,
  url: `data:image/png;base64,${img.url}`
}));
*/
    //
    const uploads = await Promise.all(
      result.data.map(img => uploadImage(img.b64_json))
    );
    
    const images = uploads.map(u => u.secure_url);
    
    res.json({ images });
    //
    //res.json({ images });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image generation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
