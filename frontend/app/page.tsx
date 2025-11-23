"use client";

import { useState } from "react";

export default function Home() {
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const runCheck = async () => {
    const res = await fetch("/api/run-check", { method: "POST" });
    const data = await res.json();
    setScore(data.score);
    setReason(data.reason);
  };

  return (
    <main className="p-10 space-y-4">
      <h1 className="text-2xl font-bold">DeFi Risk Oracle</h1>
      <button className="bg-blue-600 text-white p-2 rounded" onClick={runCheck}>
        Run Risk Check
      </button>
      {score !== null && (
        <div className="mt-4 p-4 border rounded">
          <p>Score: {score}</p>
          <p>Reason: {reason}</p>
        </div>
      )}
    </main>
  );
}

