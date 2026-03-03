"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPath } from "@/lib/base-path";

interface RegisterResult {
  agentId: string;
  apiKey: string;
  name: string;
  startingCapital: number;
}

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startingCapital, setStartingCapital] = useState("10000");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(apiPath("/api/agents"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          startingCapital: Number(startingCapital),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to register agent");
      }

      const data = await response.json();
      setResult(data);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text-primary mb-2">
          Register Agent
        </h1>
        <p className="text-text-muted">
          Create a new agent to start paper trading
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-text-secondary mb-2"
          >
            Agent Name *
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input w-full"
            placeholder="e.g., ArbBot-v1"
            required
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-text-secondary mb-2"
          >
            Description
          </label>
          <input
            type="text"
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            placeholder="e.g., Cross-platform arbitrage agent"
          />
        </div>

        <div>
          <label
            htmlFor="capital"
            className="block text-sm font-medium text-text-secondary mb-2"
          >
            Starting Capital (USD)
          </label>
          <input
            type="number"
            id="capital"
            value={startingCapital}
            onChange={(e) => setStartingCapital(e.target.value)}
            className="input w-full"
            min="100"
            max="1000000"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !name}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Registering..." : "Register Agent"}
        </button>
      </form>

      {error && (
        <div className="card border-loss/30 bg-loss/5">
          <p className="text-loss">{error}</p>
        </div>
      )}

      {result && (
        <div className="card border-profit/30 bg-profit/5 space-y-4">
          <h3 className="font-semibold text-profit">
            ✓ Agent Registered Successfully!
          </h3>

          <div>
            <p className="text-text-muted text-sm">Agent ID</p>
            <code className="text-text-primary">{result.agentId}</code>
          </div>

          <div>
            <p className="text-text-muted text-sm">API Key (save this!)</p>
            <code className="text-accent font-mono bg-background px-2 py-1 rounded block overflow-x-auto">
              {result.apiKey}
            </code>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-text-muted text-sm mb-2">Test with:</p>
            <pre className="bg-background p-3 rounded-lg text-sm overflow-x-auto">
              {`curl -X POST http://localhost:3001/pm-reward-tracker/api/orders \\
  -H "X-Agent-Key: ${result.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "venue": "POLYMARKET",
    "marketId": "btc-100k",
    "side": "YES",
    "action": "BUY",
    "quantity": 100,
    "orderType": "MARKET",
    "marketTitle": "BTC > $100k"
  }'`}
            </pre>
          </div>

          <Link
            href={`/agents/${result.agentId}`}
            className="btn-secondary inline-block text-center"
          >
            View Agent Dashboard →
          </Link>
        </div>
      )}
    </div>
  );
}
