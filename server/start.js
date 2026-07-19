import express from "express";
import app from "./index.js";

const port = Number(process.env.PORT || 8787);

app.use(express.static("dist"));
app.listen(port, () =>
  console.log(`Menu API listening at http://localhost:${port}`),
);
