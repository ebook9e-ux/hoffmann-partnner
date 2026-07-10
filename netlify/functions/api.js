/*
const serverless = require("serverless-http");
const app = require("../backend/server");

module.exports.handler = serverless(app);
*/
const serverless = require("serverless-http");
const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({
    message: "API is working"
  });
});

module.exports.handler = serverless(app);