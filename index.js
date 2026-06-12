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
import {GoogleGenAI} from "@google/genai";
import { writeFile } from 'fs'; 

import crypto from "crypto";
import qs from "querystring";

//DEPLOY ISUES
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

// ADD SHOPIFY CRYPTO BITS
//const crypto = require('crypto');



function verifyShopifyProxy(req) { 
  const { signature } = req.qurey;

  const map = Object.assign({},req.qurey);
  delete map['signature'];
  const message = qs.stringify(map);
  

  const secret = process.env.SHOPIFY_APP_SECRET;

  const digest = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  console.log("Message:", message);
  console.log("Digest:   ", digest);
  console.log("Signature:", signature);
  console.log("Secret length:", secret.length); // should be 38
  console.log("Secret first 8:", secret.substring(0, 8)); // should be shpss_d1

return digest !== secret;
/****
  return crypto.timingSafeEqual(
    Buffer.from(digest, 'hex'),
    Buffer.from(signature, 'hex')
  );
  ***/
}

// ADD SHOPIFY CRYPTO BITS....
// GOOGLE BITS
//const { GoogleGenerativeAI } = require("@google/generative-ai");
const genai = new GoogleGenerativeAI(process.env.GEM_API_KEY);

// ─── Analyse photo with Gemini Vision ────────────────────────────────────────
//CHANGED ON 14/5/26 to only get info on gender and hearing devices
/****************************************************************************/
async function analysePhoto(imageBuffer) {
  const model = genai.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const prompt = `Analyse this photo carefully scaning from left to right and return a JSON object.
Be precise and concise. If you cannot determine something, use null.
Return ONLY valid JSON, no explanation, no markdown, no code blocks.
Only mark hearing_aid.present as true if you can see clear mechanical or electronic hardware (tubing, casing, or a processor).
if you are not 100% certain, you MUST use false and set notable_features to "No visible device"
{
  "hearing_aid_count": <integer>,
  "people_count": <integer>,
  "people": [
    {
      "person_id": <integer starting at 1>,
      "gender": "<male|female|unknown>",
      "age_group": "<child|teenager|young_adult|middle_aged|elderly>",
      //"hair_colour": "<black|brown|blonde|red|grey|white|bald|unknown>",
      //"hair_length": "<bald|short|medium|long>",
      //"hair_style": "<straight|curly|wavy|afro|unknown>",
      //"facial_hair": "<none|stubble|beard|moustache|unknown>",
      //"glasses": <true|false>,
      //"skin_tone": "<very_light|light|medium|olive|dark|very_dark>",
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
/************************************************************************/
function validateAnalysis(analysis) { 
const personDefaults = {
person_id: 1,
gender: "unknown",
age_group: "young_adult",
//hair_colour: "unknown",
//hair_length: "short",
//hair_style: "unknown",
//facial_hair: "none",
//glasses: false,
//skin_tone: "medium",
hearing_aid: {
  present: false,
  type: null,
  ear: null
},
notable_features: null  
};

const topDefaults = {
hearing_aid_count: 0,
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

validated.people = validatedPeople; return validated; 
}

// ─── Fallback if vision fails entirely ───────────────────────────────────────
/*******************************************************/
function getFallbackAnalysis() { 
return {
  hearing_aid_count: 0,
  people_count: 1,
  people: [{
  person_id: 1,
  gender: "unknown",
  age_group: "young_adult",
  //hair_colour: "unknown",
  //hair_length: "short",
  //hair_style: "unknown",
  //facial_hair: "none",
  //glasses: false,
  //skin_tone: "medium",
  hearing_aid: { present: false, type: null, ear: null },
  notable_features: null
  }],
  setting: "unknown",
  mood: "happy",
  photo_quality: "good"
    
  }; 
}

// ─── Build dynamic cartoon prompt ────────────────────────────────────────────
/*******************************************************************************/
function buildCartoonPrompt(analysis, instance) { //CALL 3 times for different joke
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

  
// Hearing aid — critical for our use case
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
/*
IMPORTANT:
- Preserve the exact facial features, likeness, and identity of the people
- Do not change age, gender, or ethnicity
- Keep it clearly recognisable as the same individuals
- Output image square 1:1
- Make it a light, playful hearing-loss joke with clean composition.
*/

let Joke = "";
switch (instance){
  case 1:
  Joke = "Volume40 TV to loud ";
  break;  
case 2:
  Joke = "misheard - Pass the salt!";
  break;  
case 3:
  Joke = "calling from another room";
  break;  
}
/*****************************************************************************
return `Create a fun, warm, high-quality cartoon illustration using this image.
Expression should be Happy and full of personality.
Style: clean line art, vibrant colours, professional cartoon portrait.
Accurately represent ALL physical features — especially any hearing devices, glasses, and hair details.
White background, centred composition, upper body portrait.
Important: Make it a light, playful hearing-loss ${Joke} joke with clean composition`;   
***************************************************************************/

  return `Create a modern, high-quality cartoon illustration of the people in the uploaded image.
CRITICAL CHARACTER ACCURACY:

* Preserve the exact facial features, hairstyle, body shape, age range, ethnicity, and overall likeness
* Keep the people immediately recognisable as the original individuals
* Do not beautify, redesign, or replace facial features
* Maintain consistent appearance across all generated images

VERY IMPORTANT DEVICE RULE:

* ONLY include hearing aids or cochlear implants if they are CLEARLY visible in the original uploaded image
* NEVER invent, add, assume, or exaggerate hearing devices
* If no hearing device is visible, do not include one
* Do not imply disability visually unless confirmed by the image or user

OUTPUT:

* Square 1:1 composition
* High-quality modern cartoon style
* Clean composition focused on characters

STYLE:

* Clean line art
* Soft shading
* Friendly expressive faces
* Slightly exaggerated cartoon style
* Warm, natural colours
* Modern social-media cartoon aesthetic

BACKGROUND:

* Simple uncluttered background
* Environment can subtly support the joke theme
* Keep focus on the people

HUMOUR STYLE:

* Light relatable hearing-loss humour
* Warm, observational, and human
* Never offensive or mocking
* Avoid exaggerated stereotypes
* Make the humour situation-based rather than disability-based
* use speech bubbles to tell joke

JOKE THEME:
 ${Joke}

ADDITIONAL RULES:

* Do not add extra people
* Do not change clothing unless relevant to the joke
* Do not add random props
* Do not add graphics
* Avoid over-the-top comedy expressions
* Keep the humour believable and relatable`;

  /*******************
return `Create a fun, warm, high-quality cartoon illustration of ${count} person${plural}: ${peopleStr}.
Expression should be ${mood} and full of personality.
Style: clean line art, vibrant colours, professional cartoon portrait, comic book quality.
Accurately represent ALL physical features — especially any hearing devices, glasses, and hair details.
White background, centred composition, upper body portrait.
IMPORTANT: 
- Make it a light, playful hearing-loss ${Joke} joke with clean composition
- DO NOT add hearing aid if not stated
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
`; 
********************************/
}

// ─── Main pipeline ────────────────────────────────────────────────────────────
/***************************************************************/
async function buildPromptFromImage2(imageBuffer, instance) { 
//console.log("Analysing photo with Gemini Vision..."); //only call once move befor buildPrompt
//const analysis = await analysePhoto(imageBuffer);

return  prompt; 
}





//UPLOAD TO CLOUDINARY3
/*******************************************************/
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
       transformation: ["sample_watermark2"]
       //transformation: ["sample_watermark"]
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


//UPLOAD TO CLOUDINARY2
/*********************************************************/
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


/*****************************************************/

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://toffa.ai',
      'https://app.example.com'
    ];

    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

/*
app.use(cors({
  origin: 'https://toffa.ai',
  methods: ['GET', 'POST' ],
  credentials: true
}));
*/
app.use(express.json({ limit: "10mb" }));

/*****************************************************/
const uploadImage = async (base64) => {
  return await cloudinary.uploader.upload(
    `data:image/png;base64,${base64}`,
    {
      folder: "toffa" 
    }
  );
};

/*******************************************************/
app.get("/", (req, res) => {

  res.send("Toffa backend is running 🚀");
});


/*************************************************************/
app.post(
  "/generate-previewG",
  upload.fields([
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {  
  try {
      console.log("FILES:", req.files);
      console.log("BODY:", req.body);

      const imageFile = req.files?.image?.[0];
      const text = req.body?.text;//THIS WILL PASS BACK THE P{OSITION OF HEARING LOSS INDIVIDUALS

      if (!imageFile ) {
        return res.status(400).json({ error: "Missing image" });
      }  
    else {
      console.log("imageFile GOOD:");
    }
    
const imageBuffer = imageFile.buffer;//req.file.buffer;

 //IF TEXT PRESENT ITS A SECOND CALL SO SKIP ANALYSE
  //if (text.length === 0){
  //Step 1 Ayalyse photo for suxuaality, abause or hate    
  const moderateResponse =  await moderateImage(imageBuffer); //MODERATE UPLOADED IMAGE
  console.log("moderateResponse",moderateResponse);
  /*
   "success": true,
      "data": {
          "overall_safe": false,
  */
  if  (!moderateResponse.success || !moderateResponse.data.overall_safe){
        return res.status(200).json({"success": false, errorMessage: "Your uploaded image failed moderation" });
  }
  
  // Step 2: Analyse photo
  console.log("Analysing photo with Gemini Vision..."); 
  const analysis = await analysePhoto(imageBuffer);
  console.log("Detected " + analysis.people_count + " person(s)"); 
  console.log("Detected " + analysis.hearing_aid_count + " Hearing aid(s)"); 
  console.log("Photo quality: ",analysis.photo_quality);
  
  if (["blurry", "partially_obscured"].includes(analysis.photo_quality)) {
    console.warn("Warning: low quality photo — cartoon results may vary");
  }
  
  if  (analysis.hearing_aid_count === 0){
  console.log("No hearing aids detected: ");
  //      return res.status(200).json({"success": false, errorMessage: "unable to detect anyone with hearing loss in image, please tell me who has hearing loss in this image? from Left to Right say 1,2 or 4 etc." });
  }
//}//END OF SECOND PASS
// Step 3: Build dynamic prompts
    
const  prompt1  = await buildCartoonPrompt(analysis,1);
console.log("Prompt 1...",prompt1); 
const  prompt2  = await buildCartoonPrompt(analysis,2);
console.log("Prompt 2..."),prompt2; 
const  prompt3  = await buildCartoonPrompt(analysis,3);
console.log("Prompt 3...",prompt3); 

//CREATE  3 CARTOONS
  try {
    // 1. Create an array of 3 promises
    console.error("1. Create an array of 3 promises");
    
    const cartoonPromises = [
      CreateCartoonInGemini(imageBuffer)
      //CreateImageInGemini(imageBuffer, prompt1), 
      //CreateImageInGemini(imageBuffer, prompt2), 
      //CreateImageInGemini(imageBuffer, prompt3)
    ];

    // 2. Await all of them to complete
    console.error("2. Await all of them to complete");
    const base64Results = await Promise.all(cartoonPromises);

    // 3. Now you can map those results to your Cloudinary upload function
    console.error("3. Now you can map those results to your Cloudinary upload function");
    const uploadPromises = base64Results.map(base64Data => {
      // Assuming you have your cloudinary upload function ready:
      //return uploadToCloudinary(base64Data); 
      //upload to cloudinary
      //return cloudinary.uploader.upload(base64Data,{ folder: "toffa/faces" });
      return cloudinary.uploader.upload(
  `data:image/png;base64,base64Data`,
  { folder: "toffa/faces" }
);
    });

    console.error("4. finalUrls = await Promise.all(uploadPromises);");
    const finalUrls = await Promise.all(uploadPromises);
    
    return finalUrls; // Returns array of 3 Cloudinary URLs
  }
    catch (error) {
    console.error("Batch cartoon generation failed:", error);
    throw error;
  }
//CREATE 3 CARTOONS    
  

 
res.json({
  success: true,
  finalUrls
});

  

  } 
    catch (error) {
    console.error("Batch cartoon generation failed:", error);
    throw error;
  }
 
});

/*********************** SAVED COPY OF generate-preview BEFORE ASYNC CHANGES
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
      
      //upload to cloudinary >>> DO WE REALLY NEED TO SAVE UPLOADED IMAGE?
      const imageUpload = await cloudinary.uploader.upload(
  `data:image/png;base64,${imageBase64}`,
  { folder: "toffa/faces" }
);

const imageBuffer = imageFile.buffer;//req.file.buffer;

//Step 1 Ayalyse photo for suxuaality, abause or hate    
  const moderateResponse =  await moderateImage(imageBuffer); //MODERATE UPLOADED IMAGE
  console.log("moderateResponse",moderateResponse);
 
  if  (!moderateResponse.success || !moderateResponse.data.overall_safe){
    //FAILED MODERATION PASS ERROR BACK TO SHOPIFY
    return res.status(200).json({"success": false, errorMessage: "Your uploaded image failed moderation" });
  }
  
  // Step 2: Analyse photo
  console.log("Analysing photo with Gemini Vision..."); 
  const analysis = await analysePhoto(imageBuffer);
  console.log("Detected " + analysis.people_count + " person(s)"); 
  console.log("Detected " + analysis.hearing_aid_count + " Hearing aid(s)"); 
  console.log("Photo quality: ",analysis.photo_quality);
  
  if (["blurry", "partially_obscured"].includes(analysis.photo_quality)) {
    console.warn("Warning: low quality photo — cartoon results may vary");
  }
  
  if  (analysis.hearing_aid_count === 0){
  console.log("No hearing aids detected: ");
  //return res.status(200).json({"success": false, errorMessage: "unable to detect anyone with hearing loss in image, please tell me who has hearing loss in this image? from Left to Right say 1,2 or 4 etc." });
  }   

const  prompt  = await buildCartoonPrompt(analysis,1);
console.log("Prompt 1...",prompt); 
      
/********************************************************************************     
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
**************************************************************************/
/*
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
    prompt: prompt
    //n:3
    });
    
    // Extract image
      //
const images = await uploadMultipleToCloudinary3(response.data, jobId);

if (!images) {
  return res.status(500).json({ error: "Upload failed" });
}

// TODO: store this in DB (for now just return it)
return res.status(200).json({
  success: true,
  job_id: jobId,
  images: images.map(i => ({
    image_id: i.image_id,
    preview_url: i.preview_url
  }))
});
     
        } catch (err) {
          console.error(err);
          res.status(500).json({ error: "MAP failed" });
        }
      }
    );



**********************************************************************/


/**************************************************************************/
//updated ASYNC CHANGES
  // In-memory job store (use Redis in production)
const jobs = {};

// POST - starts job immediately, returns job_id
app.post(
  "/generate-preview",
  upload.fields([{ name: "image", maxCount: 1 }]),
  async (req, res) => {
  // Add to both your POST and GET routes at the top:
    console.log("verifyShopifyProxy(req) ",req);
  //
 // Add this at the very top
  console.log("Raw query string:", req.url);
  console.log("req.query keys:", Object.keys(req.query).sort());
  console.log("Full req.query:", JSON.stringify(req.query));
  
  //
  if (!verifyShopifyProxy(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

    try {
      const imageFile = req.files?.image?.[0];
      if (!imageFile) {
        return res.status(400).json({ error: "Missing image" });
      }

      const jobId = `job_${Date.now()}`;
      jobs[jobId] = { status: "processing" };

      // Return job_id IMMEDIATELY before any async work
      res.status(200).json({ success: true, job_id: jobId });

      // Now do all the slow work in the background
      (async () => {
        try {
          const imageBuffer = imageFile.buffer;
          const imageBase64 = imageBuffer.toString("base64");

          // Moderation
          const moderateResponse = await moderateImage(imageBuffer);
          if (!moderateResponse.success || !moderateResponse.data.overall_safe) {
            jobs[jobId] = { status: "failed", errorMessage: "Your uploaded image failed moderation" };
            return;
          }

          // Upload to Cloudinary
          const imageUpload = await cloudinary.uploader.upload(
            `data:image/png;base64,${imageBase64}`,
            { folder: "toffa/faces" }
          );

          // Analyse
          const analysis = await analysePhoto(imageBuffer);
          const prompt = await buildCartoonPrompt(analysis, 1);

          // Download uploaded image for OpenAI
          const response2 = await fetch(imageUpload.url);
          const arrayBuffer = await response2.arrayBuffer();
          const imageFile2 = await toFile(Buffer.from(arrayBuffer), "family-photo.jpg", {
            type: "image/jpeg",
          });

          // OpenAI generation (the slow part)
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const response = await openai.images.edit({
            model: "gpt-image-1.5",
            image: [imageFile2],
            size: "1024x1024",
            quality: "high",
            prompt: prompt,
          });

          // Upload results to Cloudinary
          const images = await uploadMultipleToCloudinary3(response.data, jobId);
          if (!images) {
            jobs[jobId] = { status: "failed", errorMessage: "Upload failed" };
            return;
          }

          jobs[jobId] = {
            status: "complete",
            images: images.map(i => ({
              image_id: i.image_id,
              preview_url: i.preview_url,
            })),
          };
        } catch (err) {
          console.error("Background job failed:", err);
          jobs[jobId] = { status: "failed", errorMessage: "Generation failed" };
        }
      })();

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to start job" });
    }
  }
);

// GET - poll for job status
app.get("/generate-preview", async (req, res) => {

// Add to both your POST and GET routes at the top:
if (!verifyShopifyProxy(req)) {
  return res.status(403).json({ error: 'Forbidden' });
}

  const jobId = req.query.job_id;
  if (!jobId || !jobs[jobId]) {
    return res.status(404).json({ status: "not_found" });
  }
  return res.status(200).json(jobs[jobId]);
});
//END OF ASYNC CHANGES


  
//CHECK IMAGE const { GoogleGenAI, Type } = require("@google/genai");
/********************************************************************/
  //Analyze this image for safety violations. Check for: Nudity or sexually explicit content. Abuse, harassment, or hate speech. Violence, gore, or physical harm.
  async function moderateImage(imageBuffer) {
  const apiKey = process.env.GEM_API_KEY;
  if (!apiKey) {
    console.error("Please set GEMINI_API_KEY environment variable.");
    return;
  }    
    

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
      const str = JSON.stringify(JSON.parse(text), null, 2);
      console.log("STR",str);
      // Strip markdown code blocks if Gemini adds them anyway
    //text = text.replace(/^ json\s/i, "").replace(/^```\s/i, "").replace(/\s*```$/i, "").trim();

    //res.status(200).json({ success: true, data: JSON.parse(text)});
    return { success: true, data: JSON.parse(text)};
    } else {
      console.log("No response text received.");
    //res.status(500).json({ success: false, errorMessage: error.message});
    return { success: false, errorMessage: error.message};
    }
  } catch (error) {
    console.error("Error during analysis:", error.message);
    //res.status(500).json({ success: false, error: "Error during analysis",errorMessage: error.message});
    return { success: false, error: "Error during analysis",errorMessage: error.message};
        
  }
}//); //END OF async function moderateImage(imageBuffer)

    
//CHECK IMAGE

//CREATE CARTOON IN GEMNI
async function CreateImageInGemini(imageBuffer, prompt) {
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

