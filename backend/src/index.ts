import dotenv from "dotenv";
import express, { Application, Request, Response } from "express";
import { initializeDatabase } from "./db";
import analysisRoutes from "./routes/analysis";
import authRoutes from "./routes/auth";
import commentsRoutes from "./routes/comments";
import discoveryRoutes from "./routes/discovery";
import postsRoutes from "./routes/posts";
import songsRoutes from "./routes/songs";
import tasteRoutes from "./routes/taste";
import usersRoutes from "./routes/users";

const cors = require("cors");

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:8081"];

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
    cors({
        origin: function (origin: any, callback: any) {
            // Allow requests from specified origins
            if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
                callback(null, true);
            } else {
                console.log(origin);

                callback(new Error("Origin not allowed by CORS"));
            }
        },
    }),
);

app.get("/", (req: Request, res: Response) => {
    res.send("Melodi Backend is running!");
});

app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/songs", songsRoutes);
app.use("/api/save-songs", songsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/taste", tasteRoutes);
app.use("/api/discovery", discoveryRoutes);
app.use("/api/comments", commentsRoutes);

const startServer = async () => {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();
