import express from "express";
import cors from "cors";
import OpenAI from "openai"; 
//import OpenAI, { toFile } from "openai";//<<<<<
import multer from "multer";
import fs from "fs";//<<<<<


const upload = multer({ storage: multer.memoryStorage() });

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();


app.use(cors({
  origin: 'https://toffa.ai',
  methods: ['GET', 'POST'],
  credentials: true
}));
//app.use(express.json());
app.use(express.json({ limit: "10mb" }));


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

//updated /generate-preview to accept files
app.post(
  "/generate-preview",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {

      //console.log("Whai i got:", req);
      console.log("FILES:", req.files);
      console.log("BODY:", req.body);

      const imageFile = req.files?.image?.[0];
      const text = req.body?.text;

      if (!imageFile ) {
        return res.status(400).json({ error: "Missing image" });
      }
      console.log("imageFile:", imageFile);
      //convert to base64
      const imageBase64 = imageFile.buffer.toString("base64");
      //console.log("imageBase64:", imageBase64);
      
      //upload to cloudinary
      const imageUpload = await cloudinary.uploader.upload(
  `data:image/png;base64,${imageBase64}`,
  { folder: "toffa/faces" }
);
      console.log("Cloudinary imageUpload:", imageUpload);
      
//BUILD PROMPT
      const prompt = `
      Create ONE single modern comic-style cartoon image.
      
      Each generated image should have a slightly different pose and expression.
      
      Scene: Couple in a cosy home setting.
      
      Characters:
      - Female: arms crossed, slightly annoyed but warm
      - Male: confused, adjusting hearing aid
      
      IMPORTANT:
      Use the uploaded images as the exact facial reference for each character.
      Preserve likeness while rendering in a modern comic style.
      
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

/*
const imageFiles = [
    imageUpload.url
];

const openaiImages = await Promise.all(
    imageFiles.map(async (file) =>
        await toFile(fs.createReadStream(file), null, {
            type: "image/png",
        })
    ),
);
*/


      
      //SEND TO OpenAI
      const result = await openai.images.generate({
      model: "gpt-image-1",
      n: 3,
      prompt: prompt,
      input_image: req.files,//imageFile
    });

      console.log("openai response:", result);

      
      
    // NEED UPDATE FOR MODEL
    //upload result images to cloudinary
      const uploads = await Promise.all(
      result.data.map(img =>
        cloudinary.uploader.upload(
          `data:image/png;base64,${img.b64_json}`,
          { folder: "toffa/previews" }
        )
      )
    );
    
    const images = uploads.map(u => u.secure_url);
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "failed" });
        }
      }
    );
    



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
