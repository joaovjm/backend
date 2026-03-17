import app from "./app.js";

if(process.env.NODE_ENV !== "production"){
  await import ("dotenv/config")
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
