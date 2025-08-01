import dotenv from "dotenv";
dotenv.config();
import express from "express";
import connectDB from "./utils/db.js";
import userRoutes from "./routes/user.routes.js";
import cookieParser from "cookie-parser";
import errorHandler from "./middlewares/error-handler.js";
import { admin, auth } from "./middlewares/auth.js";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", auth, (req, res) => {
  // app.get("/", (req, res) => {
  res.status(200).json({ message: "healty" });
});

app.use("/auth", userRoutes);

const startServer = async () => {
  await connectDB();
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
};

startServer();

app.use(errorHandler);
