import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Toffa backend is running 🚀");
});

app.post("/generate-preview", async (req, res) => {
  res.json({ message: "Preview endpoint working" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
