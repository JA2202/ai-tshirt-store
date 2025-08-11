"use client";

import { useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setImageUrl("");

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    if (data.imageUrl) setImageUrl(data.imageUrl);
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8">
      <h1 className="text-4xl font-bold mb-4">AI T-Shirt Design Generator</h1>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your design..."
          className="border rounded-lg px-4 py-2 w-80"
        />
        <button
          onClick={handleGenerate}
          className="bg-black text-white px-4 py-2 rounded-lg"
        >
          Generate
        </button>
      </div>
      {loading && <p>Generating image...</p>}
      {imageUrl && <img src={imageUrl} alt="Generated design" className="max-w-xs mt-4" />}
    </main>
  );
}
