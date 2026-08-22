import { put } from "@vercel/blob";
import { readFileSync } from "fs";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN not set");
  process.exit(1);
}

const videoPath = "/Users/sumeetharish/Downloads/PeptideVideo_Careers.mp4";
const fileContent = readFileSync(videoPath);

const blob = await put("hr/peptide-position.mp4", fileContent, {
  access: "public",
  token,
  contentType: "video/mp4",
});

console.log("✓ Video uploaded successfully!");
console.log("URL:", blob.url);
