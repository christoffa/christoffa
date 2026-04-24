import express from "express";
import cors from "cors";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
const upload = multer({ storage: multer.memoryStorage() });
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
//UPLOAD TO CLOUDINARY3

async function uploadMultipleToCloudinary3(data, jobId) {
  console.log("Uploading masters + previews jobId ",jobId);

  try {
    const uploads = await Promise.all(
      data.map(async (img, index) => {
        const dataUri = `data:image/png;base64,${img.b64_json}`;

        // 🔐 1. Upload MASTER (private)
        const master = await cloudinary.uploader.upload(dataUri, {
          folder: `toffa/${jobId}/masters`,
          public_id: `img_${index}`,
          resource_type: "image",
          type: "authenticated", // 🔥 CRITICAL
          transformation: ["final_watermark"]
        });

        // 👁️ 2. Create PREVIEW (public derived URL)
        const preview = await cloudinary.uploader.upload(dataUri, {
        folder: `toffa/${jobId}/previews`,
        public_id: `img_${index}`,
        resource_type: "image",
       transformation: ["sample_watermark"]
        });
        /*
        const previewUrl = cloudinary.url(master.public_id, {
          width: 400,
          quality: "auto:low",
          fetch_format: "jpg",
          overlay: "text:Arial_30:toffa.ai",
          gravity: "south_east",
          x: 15,
          y: 15
        });
        */
        return {
          image_id: index,
          preview_url: preview.secure_url,
          master_public_id: master.public_id
        };
      })
    );

    return uploads;

  } catch (error) {
    console.error("Upload failed:", error);
    return null;
  }
}
//UPLOAD TO CLOUDINARY3

async function uploadMultipleToCloudinary2(data) {
//Map through ALL returned images
  
console.log("uploadMultipleToCloudinary2:");
      try {
      const uploads = await Promise.all(
      data.map(async (img, index) => {
        const dataUri = `data:image/png;base64,${img.b64_json}`;
      console.log("dataUri:",dataUri);
        const upload = await cloudinary.uploader.upload(dataUri, {
          folder: "toffa-previews",
          public_id: `preview_${Date.now()}_${index}`,
          //transformation: [
          //  { quality: "auto" },
          //  { fetch_format: "auto" },
          //],
      });
        return upload.secure_url;
      })
    );

    // 3. Return ALL image URLs
  return uploads;
  } catch (error) {
    console.error("One or more uploads failed:", error);
    retrun;    
  }

} 
const app = express();
app.use(cors({
  origin: 'https://toffa.ai',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));


const uploadImage = async (base64) => {
  return await cloudinary.uploader.upload(
    `data:image/png;base64,${base64}`,
    {
      folder: "toffa" 
    }
  );
};


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
      const jobId = `job_${Date.now()}`;
      //console.log("Whai i got:", req);
      console.log("FILES:", req.files);
      console.log("BODY:", req.body);

      const imageFile = req.files?.image?.[0];
      const text = req.body?.text;

      if (!imageFile ) {
        return res.status(400).json({ error: "Missing image" });
      }
      //console.log("imageFile:", imageFile);
      //convert to base64
      const imageBase64 = imageFile.buffer.toString("base64");
      //console.log("imageBase64:", imageBase64);
      
      //upload to cloudinary
      const imageUpload = await cloudinary.uploader.upload(
  `data:image/png;base64,${imageBase64}`,
  { folder: "toffa/faces" }
);
     
      
//BUILD PROMPT NEED TO IMPROVE PROMPT - NEED TO SWITCH ON HEARING LOSS JOKE TYPE
      const OLDprompt = `Create ONE single square modern comic-style cartoon image based on the uploaded  photo.
Use the uploaded image as the exact facial reference for each character and preserve likeness.
Give each person a slightly different pose and expression.
Include one visible behind-the-ear hearing aid, Oticon style.
Make it a light, playful hearing-loss joke with clean composition.
Make each cartoon to have a different Hearing Loss Joke theme.
Add a subtle watermark: "created at toffa.ai".
Output one image only, square 1:1.`;
//GPT
      const prompt = `Create a modern, high-quality cartoon illustration of the people in the uploaded image.

IMPORTANT:
- Preserve the exact facial features, likeness, and identity of the people
- Do not change age, gender, or ethnicity
- Keep it clearly recognisable as the same individuals
- Output image square 1:1
- Make it a light, playful hearing-loss joke with clean composition.
- Make each cartoon to have a different Hearing Loss Joke theme

Style:
- Clean line art
- Soft shading
- Warm, friendly, likeable expression
- Slightly exaggerated cartoon style, but not distorted

Scene:
- Simple, uncluttered background
- Focus on the characters

Tone:
- Light humour around hearing loss
- Subtle and relatable, not offensive

Consistency:
- Same people, same face, consistent features across all generated images`;


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

//PROCESS IMAGE
      const iURL = imageUpload.url;

// Download the image
const response2 = await fetch(iURL);
const arrayBuffer = await response2.arrayBuffer();

// Convert to a File object the API can accept
const imageFile2 = await toFile(Buffer.from(arrayBuffer), "family-photo.jpg", {
  type: "image/jpeg",
});
      
//console.log("imageFile2:>>>>>>>>>>>>", imageFile2);

//PROCESS IMAGE      
const response = await openai.images.edit({
  model: "gpt-image-1.5",
  //image:imageUpload.buffer,
    image: [imageFile2],//[imageUpload.buffer],
    size: "1024x1024",
    quality:"high",
    prompt: prompt,
    n:3
    });
    
    // Extract image
      //
const images = await uploadMultipleToCloudinary3(response.data, jobId);

if (!images) {
  return res.status(500).json({ error: "Upload failed" });
}

// TODO: store this in DB (for now just return it)
res.status(200).json({
  success: true,
  job_id: jobId,
  images: images.map(i => ({
    image_id: i.image_id,
    preview_url: i.preview_url
  }))
});
      //
      /*
    const URLS = await uploadMultipleToCloudinary2(response.data);
    if (!URLS){
      res.status(500).json({ error: "uploadMultipleToCloudinary2 failed" });;
    }
    res.status(200).json({success: true, data: URLS});
    */
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "MAP failed" });
        }
      }
    );
    



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

