import express from "express";
import cors from "cors";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";
const upload = multer({ storage: multer.memoryStorage() });
import { v2 as cloudinary } from "cloudinary";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import  sharp  from "sharp";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
//import { Type }  from "@google/generative-ai";
//import { buildPromptFromImage } from "./vision-analysis.js";

//
//const express = require("express"); 
//const multer = require("multer"); 
//const upload = multer({ storage: multer.memoryStorage() }); 
//const sharp = require("sharp");

const app = express();
//
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
// GOOGLE BITS
//const { GoogleGenerativeAI } = require("@google/generative-ai");
const genai = new GoogleGenerativeAI(process.env.GEM_API_KEY);

// ─── Analyse photo with Gemini Vision ────────────────────────────────────────

async function analysePhoto(imageBuffer) {
  const model = genai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `Analyse this photo carefully and return a JSON object.
Be precise and concise. If you cannot determine something, use null.
Return ONLY valid JSON, no explanation, no markdown, no code blocks.
Only mark hearing_aid.present as true if you can see clear mechanical or electronic hardwar (tubing, casing, or a procssor).
if you are not 100% certain, you MUST use false and set notable_features to "No visable devive"
{
  "people_count": <integer>,
  "people": [
    {
      "person_id": <integer starting at 1>,
      "gender": "<male|female|unknown>",
      "age_group": "<child|teenager|young_adult|middle_aged|elderly>",
      "hair_colour": "<black|brown|blonde|red|grey|white|bald|unknown>",
      "hair_length": "<bald|short|medium|long>",
      "hair_style": "<straight|curly|wavy|afro|unknown>",
      "facial_hair": "<none|stubble|beard|moustache|unknown>",
      "glasses": <true|false>,
      "skin_tone": "<very_light|light|medium|olive|dark|very_dark>",
      "hearing_aid": {
        "present": <true|false>,
        "type": "<behind_ear|in_ear|cochlear_implant|unknown|BAHA|non-visable|null>",
        "ear": "<left|right|both|unknown|null>",
        "detection_confidence": <float 0.0 to 1.0> 
      },
      "notable_features": "<string describing any distinctive features or null>"
    }
  ],
  "setting": "<indoor|outdoor|unknown>",
  "mood": "<happy|serious|neutral|laughing|unknown>",
  "photo_quality": "<good|low_light|blurry|partially_obscured>"
}`;

  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString("base64");

    // Detect mime type using sharp
    const metadata = await sharp(imageBuffer).metadata();
    const mimeType = `image/${metadata.format}` || "image/jpeg";

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType
        }
      }
    ]);

    let raw = result.response.text().trim();

    // Strip markdown code blocks if Gemini adds them anyway
    raw = raw.replace(/^ json\s/i, "").replace(/^```\s/i, "").replace(/\s*```$/i, "").trim();

    const analysis = JSON.parse(raw);
    return validateAnalysis(analysis);

  
  } 
catch (err) {
    console.error("Gemini vision error:", err.message);
return getFallbackAnalysis();
  } 
}//  END async function analysePhoto(imageBuffer)

// ─── Validate and fill safe defaults ─────────────────────────────────────────

function validateAnalysis(analysis) { 
const personDefaults = {
person_id: 1,
gender: "unknown",
age_group: "young_adult",
hair_colour: "unknown",
hair_length: "short",
hair_style: "unknown",
facial_hair: "none",
glasses: false,
skin_tone: "medium",
hearing_aid: {
  present: false,
  type: null,
  ear: null
},
notable_features: null  
};

const topDefaults = {
people_count: 1,
people: [],
setting: "unknown",
mood: "happy",
photo_quality: "good"
  
};

// Fill top-level defaults 
const validated = { ...topDefaults, ...analysis };

// Fill per-person defaults 
const validatedPeople = (validated.people || []).map(person => {

const merged = { ...personDefaults, ...person };
merged.hearing_aid = {
  present: person.hearing_aid?.present ?? false,
  type: person.hearing_aid?.type ?? null,
  ear: person.hearing_aid?.ear ?? null
};
return merged;
  
});

// If no people detected, add one default 
if (validatedPeople.length === 0) {

validatedPeople.push(personDefaults);
validated.people_count = 1;
  
}

validated.people = validatedPeople; return validated; }

// ─── Fallback if vision fails entirely ───────────────────────────────────────

function getFallbackAnalysis() { 
return {
  people_count: 1,
  people: [{
  person_id: 1,
  gender: "unknown",
  age_group: "young_adult",
  hair_colour: "unknown",
  hair_length: "short",
  hair_style: "unknown",
  facial_hair: "none",
  glasses: false,
  skin_tone: "medium",
  hearing_aid: { present: false, type: null, ear: null },
  notable_features: null
  }],
  setting: "unknown",
  mood: "happy",
  photo_quality: "good"
    
  }; 
}

// ─── Build dynamic cartoon prompt ────────────────────────────────────────────
function buildCartoonPrompt(analysis) { 
const { people, people_count: count, mood = "happy" } = analysis;
const descriptions = people.map(p => {
const parts = [];
  
// Age and gender
const age = (p.age_group || "adult").replace(/_/g, " ");
const gender = p.gender || "person";
parts.push(`${age} ${gender}`);

// Hair
if (p.hair_length === "bald") {
  parts.push("bald");
} else if (p.hair_length && p.hair_colour) {
  const style = p.hair_style && p.hair_style !== "unknown" ? ` ${p.hair_style}` : "";
  parts.push(`${p.hair_length} ${p.hair_colour}${style} hair`);
}

// Facial hair
if (p.facial_hair && !["none", "unknown"].includes(p.facial_hair)) {
  parts.push(p.facial_hair);
}

// Glasses
if (p.glasses) parts.push("wearing glasses");

// Hearing aid — critical for your use case
const ha = p.hearing_aid || {};
if (ha.present) {
  const haType = (ha.type || "hearing aid").replace(/_/g, " ");
  const haEar = ha.ear && ha.ear !== "unknown" ? ` on ${ha.ear} ear` : "";
  parts.push(`wearing ${haType}${haEar}`);
}

// Notable features
if (p.notable_features) parts.push(p.notable_features);

return parts.join(", ");
  
});

const peopleStr = descriptions.join(" and "); 
const plural = count !== 1 ? "s" : "";

return `Create a fun, warm, high-quality cartoon illustration of ${count} person${plural}: ${peopleStr}.
Expression should be ${mood} and full of personality.
Style: clean line art, vibrant colours, professional cartoon portrait, comic book quality.
Accurately represent ALL physical features — especially any hearing devices, glasses, and hair details.
White background, centred composition, upper body portrait.`; 
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function buildPromptFromImage2(imageBuffer) { 
console.log("Analysing photo with Gemini Vision..."); 
const analysis = await analysePhoto(imageBuffer);

console.log("Detected ${analysis.people_count} person(s), mood: ${analysis.mood}"); 
console.log("Photo quality: ${analysis.photo_quality}");

if (["blurry", "partially_obscured"].includes(analysis.photo_quality)) {
  console.warn("Warning: low quality photo — cartoon results may vary");
}

const prompt = buildCartoonPrompt(analysis); 
console.log("Built prompt:", prompt);

return { analysis, prompt }; 
}
//NOT SURE export { buildPromptFromImage, analysePhoto, buildCartoonPrompt };

//module.exports = { buildPromptFromImage, analysePhoto, buildCartoonPrompt };

/*Then in your existing Express endpoint:*/
//SOME OF THIS MAT BE DUPS
//const express = require("express"); 
//const multer = require("multer"); 
//const { buildPromptFromImage } = require("./vision-analysis");

//const upload = multer({ storage: multer.memoryStorage() }); 
//const app = express();


//GOOGEL BITS



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
//const app = express();
app.use(cors({
  origin: 'https://toffa.ai',
  methods: ['GET', 'POST' ],
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



//app.post("/generate-previewG", upload.single("image"), async (req, res) => { 
//app.post("/generate-previewG", upload.fields([ { name: "image", maxCount: 1 }]), async (req, res) => { 
app.post(
  "/generate-previewG",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {  
  try {
      console.log(">>1");//LOGGING
      console.log("Whai i got:", req);
      console.log("FILES:", req.files);
      console.log("BODY:", req.body);

      const imageFile = req.files?.image?.[0];
      const text = req.body?.text;

      if (!imageFile ) {
        return res.status(400).json({ error: "Missing image" });
      }  
    else {
      console.log("imageFile GOOD:");
    }
    
const imageBuffer = imageFile.buffer;//req.file.buffer;

//VALIDATE UPLOADED PHOTO FOR SAFETY
//const { HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE, // Most restrictive
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
];
console.log(">>safetySettings",safetySettings);//LOGGING

const model = genai.getGenerativeModel({ 
  model: "gemini-3-flash-preview",
  safetySettings // Apply settings here
});
console.log(">>model",model);//LOGGING

try {
    const base64Image = imageBuffer.toString("base64");
    console.log(">>>1");//LOGGING
  
    // Detect mime type using sharp
    const metadata = await sharp(imageBuffer).metadata();
    console.log(">>>2");//LOGGING
    const mimeType = `image/${metadata.format}` || "image/jpeg";
    console.log(">>>3");//LOGGING
  
    const result = await model.generateContent([
      "check safety settings in this image",
      {
        inlineData: {
          data: base64Image,
          mimeType
        }
      }
    ]);
  console.log(">>>4");//LOGGING
  
  console.log("await model.generateContent");//LOGGING
  /*
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [ { text: json_prompt }, { inlineData: { data: base64, mimeType: "image/png" } } ] }]
  });
*/
  console.log("Preresponse",);//LOGGING
  const response = await result.response;
  console.log("response",response);//LOGGING
  // Check if the prompt was blocked
  if (response.promptFeedback && response.promptFeedback.blockReason) {
    console.warn(`Blocked: ${response.promptFeedback.blockReason}`);
    return res.status(400).json({ 
      success: false, 
      error: "Image violates safety policies (Harmful content detected)." 
    });
  }
console.log(">>5");//LOGGING
  
  // Check if the candidate was blocked (response generation)
  if (!response.candidates || response.candidates[0].finishReason === 'SAFETY') {
    return res.status(400).json({ 
      success: false, 
      error: "Content analysis blocked due to safety concerns." 
    });
  }
 console.log(">>6");//LOGGING

  const data = JSON.parse(response.text());
  console.log(">>7 response.text()",response.text());//LOGGING
  res.json({ success: true, data });

} catch (error) {
  // Catch technical API errors
  res.status(500).json({ success: false, error: "Analysis failed.", errorReason: error.message });
  return;
}
return; //TESTING
//VALIDATE UPLOADED PHOTO FOR SAFETY
  
// Step 1: Analyse photo + build dynamic prompt
const { analysis, prompt } = await buildPromptFromImage2(imageBuffer);

// Step 2: Pass prompt to your existing image generator
// const images = await yourExistingGenerator(imageBuffer, prompt);

  //for testing retun response of analyse
res.json({
  success: true,
  prompt,                    // remove in production
  analysis,                  // remove in production
  // images
});

  
} catch (err) {
  console.error(err);
  res.status(500).json({ success: false, error: err.message });  
  } 
});
 // 




//updated /generate-preview to accept files
app.post(
  "/generate-preview",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const jobId = `job_${Date.now()}`;
      console.log("Whai i got:", req);
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

//CHECK IMAGE const { GoogleGenAI, Type } = require("@google/genai");
app.post(
  "/moderate",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => { 
    console.log("FILES:", req.files);
      console.log("BODY:", req.body);

//async function analyzeImage(imageBuffer) {
  const apiKey = process.env.GEM_API_KEY;
  if (!apiKey) {
    console.error("Please set GEMINI_API_KEY environment variable.");
    return;
  }    
    const imageFile = req.files?.image?.[0];
    const text = req.body?.text;

     if (!imageFile ) {
        return res.status(400).json({ error: "Missing image" });
      }  
    else {
      console.log("imageFile GOOD:");
    }
    
  const imageBuffer = imageFile.buffer;//req.file.buffer;


  //const ai = new GoogleGenAI({ apiKey });
  //const ai = new GoogleGenerativeAI({ apiKey });//GoogleGenerativeAI
  
  // Read image and convert to base64
  //const imageBuffer = fs.readFileSync(imagePath);
  const base64Data = imageBuffer.toString("base64");
  const extension = 'png';//path.extname(imagePath).slice(1);//mimetype
  const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          overall_safe: { type: SchemaType.BOOLEAN },
          categories: {
            type: SchemaType.OBJECT,
            properties: {
              nudity: {
                type: SchemaType.OBJECT,
                properties: {
                  score: { type: SchemaType.NUMBER },
                  detected: { type: SchemaType.BOOLEAN },
                  reason: { type: SchemaType.STRING },
                },
                required: ["score", "detected", "reason"],
              },
              abuse: {
                type: SchemaType.OBJECT,
                properties: {
                  score: { type: SchemaType.NUMBER },
                  detected: { type: SchemaType.BOOLEAN },
                  reason: { type: SchemaType.STRING },
                },
                required: ["score", "detected", "reason"],
              },
              violence: {
                type: SchemaType.OBJECT,
                properties: {
                  score: { type: SchemaType.NUMBER },
                  detected: { type: SchemaType.BOOLEAN },
                  reason: { type: SchemaType.STRING },
                },
                required: ["score", "detected", "reason"],
              },
            },
            required: ["nudity", "abuse", "violence"],
          },
        },
        required: ["overall_safe", "categories"],
      },
    },
  });
  
  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Data = imageBuffer.toString("base64");
  const extension = path.extname(imagePath).slice(1);
  const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  const prompt = `Analyze this image for safety violations. Check for:
1. Nudity or sexually explicit content.
2. Abuse, harassment, or hate speech.
3. Violence, gore, or physical harm.

Provide a score (0 to 1) for the likelihood of each category, a boolean 'detected', and a 'reason'.
Return results in JSON format.`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      },
    ]);

    console.log("Analysis Result:");
    const text = result.response.text();
    if (text) {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } else {
      console.log("No response text received.");
    }
  } catch (error) {
    console.error("Error during analysis:", error.message);
  }
});

    
//CHECK IMAGE



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

