import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import errorMiddleware from "./middlewares/error.middleware.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", routes);

app.use(errorMiddleware);

export default app;
