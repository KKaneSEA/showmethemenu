import app from "../server/index.js";

// Vercel maps this file to /api/menu-search and invokes the Express app as a
// Node.js serverless function. The OpenAI key remains server-side in Vercel.
export default function menuSearch(request, response) {
  return app(request, response);
}
