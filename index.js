import express from "express";
import cors from "cors";
//import OpenAI from "openai"; 
//import OpenAI, { toFile } from "openai";//<<<<<
import multer from "multer";
import fs from "fs";//<<<<<
import fetch from "node-fetch";
import FormData from "form-data";
const upload = multer({ storage: multer.memoryStorage() });
import { v2 as cloudinary } from "cloudinary";
import { GoogleGenerativeAI } from "@google/generative-ai";
//
//const { GoogleGenerativeAI } = require("@google/generative-ai");
//const fs = require("fs");

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEM_API_KEY);
/*
async function generateImage() {
  // Use the Nano Banana 2 model ID
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-image-preview" 
  });

  const prompt = "A futuristic cyberpunk city with neon banana-shaped skyscrapers";

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Nano Banana 2 returns image data which you can then save or process
    const artifact = response.artifacts[0]; 
    fs.writeFileSync("output.png", Buffer.from(artifact.base64, "base64"));
    
    console.log("Image generated successfully!");
  } catch (error) {
    console.error("Error generating image:", error);
  }
}
*/
//generateImage();

//

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
/*
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
*/

app.get("/", (req, res) => {
  res.send("Toffa backend is running 🚀");
});


//NANO BANANA 2 GEM_API_KEY



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
      //console.log("Cloudinary imageUpload:", imageUpload);
      
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

      //GEMINI

// Use the Nano Banana 2 model ID
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-image-preview" 
  });

  //const prompt = "A futuristic cyberpunk city with neon banana-shaped skyscrapers";

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    console.error("RESPONSE:", response);

    // Nano Banana 2 returns image data which you can then save or process
    const artifact = response.artifacts[0]; 
    fs.writeFileSync("output.png", Buffer.from(artifact.base64, "base64"));
    
    console.log("Image generated successfully!");
  } catch (error) {
    console.error("Error generating image:", error);
  }

      //
      
/*
const raw = JSON.stringify({
  "model": "gpt-image-1.5",
  "prompt": "A bright, funny cartoon of a man mishearing his wife, speech bubbles, British humour, clean simple style",
  "size": "1024x1024",
  "n": 3,
  "images": "//res.cloudinary.com/dgfr49wwa/image/upload/v1774984269/j9v9gxsrqqfcbxe8qf5z.jpg"
});

const requestOptions = {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow"
};

fetch("https://api.openai.com/v1/images/edits", requestOptions)
  .then((response) => response.text())
  .then((result) => console.log(result))
  .catch((error) => console.error(error));

      //FORM DATA
     const form = new FormData();
    form.append("model", "gpt-image-1.5"); // or dall-e-2 if needed
    form.append("prompt", prompt);
    form.append("n", "3");
    form.append("size", "512x512");
    form.append("image", req.files.image[0]);
const raw = JSON.stringify({
  "model": "gpt-image-1.5",
  "prompt": "A bright, funny cartoon of a man mishearing his wife, speech bubbles, British humour, clean simple style",
  "size": "1024x1024",
  "n": 3,
  "images": imageUpload.url
});
      
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: raw,
    });

   // console.log("FORMDATA:", form);
    console.log("POST RESPONSE:", result);
   */
      
      /*
      //SEND TO OpenAI
      const result = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        n: 3,
        size: "512x512",
        //image: fs.createReadStream(req.file.path),
        input_image: imageFile.buffer, // 👈 THIS is correct in v6
      });
      */

      
      /*
      const result = await openai.images.generate({
      model: "gpt-image-1",
      n: 3,
      prompt: prompt,
      input_image: req.files,//imageFile
    });
*/
      

      
      
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
