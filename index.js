import express from "express";
import cors from "cors";
//import OpenAI from "openai"; 
import OpenAI, { toFile } from "openai";//<<<<<
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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
//UPLOAD TO CLOUDINARY
async function uploadMultipleToCloudinary2(data) {
/ 2. Map through ALL returned images

      const uploads = await Promise.all(
      data.map(async (img, index) => {
        const dataUri = `data:image/png;base64,${img.b64_json}`;
        const upload = await cloudinary.uploader.upload(dataUri, {
          folder: "toffa-previews",
          public_id: `preview_${Date.now()}_${index}`,
          transformation: [
            { quality: "auto" },
            { fetch_format: "auto" },
          ],
      });
        return upload.secure_url;
      })
    );

    // 3. Return ALL image URLs
  return uploads;
  


} catch (error) {
    console.error("One or more uploads failed:", error);
  }
}

async function uploadMultipleToCloudinary(response) {
  // 1. Filter out only the parts that contain image data
  const imageParts = response.candidates[0].content.parts.filter(part => part.inlineData);
  //const imageParts = response.candidates.content.parts.filter(part => part.inlineData);

  // 2. Map the parts to an array of Cloudinary upload promises
  const uploadPromises = imageParts.map(async (part, index) => {
    const fileStr = `data:image/png;base64,${part.inlineData.data}`;
    
    // Return the promise from Cloudinary
    return cloudinary.uploader.upload(fileStr, {
      folder: "gemini_batch",
      public_id: `gen_image_${Date.now()}_${index}`
    });
  });

  try {
    // 3. Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);
    
    // 4. Map the results to just get the URLs
    const urls = results.map(res => res.secure_url);
    
    console.log("All images uploaded:", urls);
    return urls;
  } catch (error) {
    console.error("One or more uploads failed:", error);
  }
}


// end cloudinary
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
//GPT


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await openai.images.generate({
  model: "gpt-image-1.5",
  image:imageUpload.buffer,
  size: "1024x1024",
    prompt: prompt
    /*
  input: [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "Turn this into a funny cartoon with bold lines and bright colours"
        },
        {
          type: "input_image",
          image_url: imageUpload.url//fs.readFileSync(imageFile.buffer, { encoding: "base64" })
        }
      ]
    }
  ],
  tools: [{ type: "image_generation" }]
  */

});

// Extract image
console.log("RESPONSE:>>>>>>>>>>>>", response);
console.log("RESPONSE.data:>>>>>>>>>>>>", response.data);
   
const URLS = await uploadMultipleToCloudinary2(response.data);
console.log("URLS:>>>>>>>>>>>>", URLS);
res.status(200).json({success: true, data: URLS});
//fs.writeFileSync("output.png", Buffer.from(image.b64_json, "base64"));
//GPT      
/*
// Use the Nano Banana 2 model ID //GEMINI
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-image-preview" 
  });

  const prompt2 = "A futuristic cyberpunk city with neon banana-shaped skyscrapers";

  try {
    //const result = await model.generateContent(prompt2);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // THIS CONFIG IS REQUIRED TO GET AN IMAGE BACK
      generationConfig: {
        responseModalities: ["IMAGE"],
       // candidateCount: 3
      },
    });
    const response = await result.response;

    console.error("RESPONSE:", response);
    console.error("resp.....:", response.candidates[0].content.parts);
    

    // Nano Banana 2 returns image data which you can then save or process
    const imageUrls = await uploadMultipleToCloudinary(response);
    console.log("All images uploaded imageUrls:", imageUrls);
   
    //res.status(500).json({ error: "MAP failed" });
    res.status(200).json({success: true, data: imageUrls});
    
  } catch (error) {
    console.error("Error generating image:", error);
  }
// Use the Nano Banana 2 model ID
*/


      
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
      

    
      //image/jpeg
    // NEED UPDATE FOR MODEL
      /*
    //upload result images to cloudinary
      const uploads = await Promise.all(
      response.candidates[0].content.parts.map(img =>
        cloudinary.uploader.upload(
          `data:image/jpeg;base64,${img.b64_json}`,
          { folder: "toffa/previews" }
        )
      )
    );
    
    const images = uploads.map(u => u.secure_url);
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
/*

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");

const genAI = new GoogleGenerativeAI("YOUR_API_KEY");

async function generateImage() {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-image-preview" 
  });

  const prompt = "A high-quality cartoon of a dog and owner at a pub";

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      // THIS CONFIG IS REQUIRED TO GET AN IMAGE BACK
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    });

    const response = await result.response;
    
    // In Gemini 3.1, images are returned as 'parts' within the candidate content
    const candidate = response.candidates[0];
    const imagePart = candidate.content.parts.find(part => part.inlineData);

    if (imagePart) {
      const buffer = Buffer.from(imagePart.inlineData.data, "base64");
      fs.writeFileSync("output.png", buffer);
      console.log("Image saved as output.png");
    } else {
      console.log("No image found. Response text:", response.text());
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

generateImage();

*/
