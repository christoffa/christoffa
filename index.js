import express from "express";
import cors from "cors";
import OpenAI from "openai"; 

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
app.use(cors());
//app.use(express.json());
//app.use(express.json({ limit: "15mb" }));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.post(
  "/upload-user-image",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const uploadedImage = req.files["uploadedImage"][0];
      const { text } = req.body;

      // 👉 These are buffers
      console.log(uploadedImage.buffer);
      //upload to Cloudinary
      const uploadedURL = await cloudinary.uploader.upload(file, { upload_preset: "profile_photos" });

      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  }
);
//

/*
return await cloudinary.uploader.unsigned_upload(
  `data:image/png;base64,${base64}`,
  "your_unsigned_preset_name"
);

// Flow A: upload with preset “profile_photos”
await cloudinary.uploader.upload(file, { upload_preset: "profile_photos" });

// Flow B: upload with preset “product_images”
await cloudinary.uploader.upload(file, { upload_preset: "product_images" });
*/

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


app.get("/", (req, res) => {
  res.send("Toffa backend is running 🚀");
});
//updated /generate-preview to accept base64 image
app.post(
  "/generate-preview",
  upload.fields([
    { name: "userUploadedImage", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const userUploadedImage = req.files?.userUploadedImage?.[0];
      const text = req.body?.text || "So… are you ignoring me or didn’t you hear me?";

      if (!userUploadedImage ) {
        return res.status(400).json({ error: "Missing userUploaded images" });
      }

      const userUploadedImageBase64 = userUploadedImage.buffer.toString("base64");
      
      const userUpload = await cloudinary.uploader.upload(
        `data:image/png;base64,${userUploadedImageBase64}`,
        { folder: "toffa/userUploads" }
      );

      
      const prompt = `
Create ONE single modern comic-style cartoon image.

Each generated image should have a slightly different pose and expression.

Scene: Couple in a cosy home setting.

Characters:
- Female: arms crossed, slightly annoyed but warm
- Male: confused, adjusting hearing aid

IMPORTANT:
Use the uploaded images as the exact facial reference for each character.

Speech bubble (female):
"${text}"

Square format. Watermark "created at toffa.ai"
`;

      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 3,
        images: [
          { image_url: userUpload.secure_url }
        ]
      });

      const uploads = await Promise.all(
        result.data.map(img =>
          cloudinary.uploader.upload(
            `data:image/png;base64,${img.b64_json}`,
            { folder: "toffa/previews" }
          )
        )
      );

      const images = uploads.map(u => u.secure_url);

      res.json({ images });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Generation failed" });
    }
  }
);
//
/*
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
    const result = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt,
      size: "1024x1024",
      n: 3,
    images: [
    {
      image_base64: femaleBase64
    }
    ]
    });
;

    // Extract base64 images
    const uploads = await Promise.all(
      result.data.map(img => uploadImage(img.b64_json))
    );
    
    const images = uploads.map(u => u.secure_url);
    res.json({ images });
  } 
  catch (error) {
    console.error(error);
    res.status(500).json({ error: "Image generation failed" });
  }
});
*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
