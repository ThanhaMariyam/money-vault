import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import net from "net";
import authRoutes from "./src/server/routes/auth.js";
import savingsRoutes from "./src/server/routes/savings.js";

async function findAvailablePort(startPort: number, host = "0.0.0.0") {
  const testPort = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const tester = net.createServer();

      tester.once("error", (err: NodeJS.ErrnoException) => {
        tester.close();
        if (err.code === "EADDRINUSE" || err.code === "EACCES") {
          resolve(0);
          return;
        }
        reject(err);
      });

      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port, host);
    });

  let port = startPort;
  while (true) {
    const availablePort = await testPort(port);
    if (availablePort !== 0) return availablePort;
    port += 1;
  }
}

async function startServer() {
  const app = express();
  const requestedPort = Number(process.env.PORT || 3000);
  const requestedHmrPort = Number(process.env.HMR_PORT || 24678);
  const PORT = await findAvailablePort(requestedPort);
  const HMR_PORT = await findAvailablePort(requestedHmrPort);

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/savings", savingsRoutes);

  // Database Connection (Loads securely from Render Environment Variables)
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.warn("MONGODB_URI is not defined. The APIs will not work until you set it.");
  } else {
    mongoose
      .connect(MONGODB_URI)
      .then(() => console.log("Connected to MongoDB"))
      .catch((err) => console.error("Error connecting to MongoDB", err));
  }

  // Vite middleware for local development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { port: HMR_PORT },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production settings for Render
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start the server
  app.listen(PORT, "0.0.0.0", () => {
    if (PORT !== requestedPort) {
      console.warn(`Port ${requestedPort} is busy. Using ${PORT} instead.`);
    }
    if (HMR_PORT !== requestedHmrPort) {
      console.warn(`HMR port ${requestedHmrPort} is busy. Using ${HMR_PORT} instead.`);
    }
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
