import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// VITE_MOCK=1 swaps Firebase for an in-memory mock (dev/testing without rules)
const mock = process.env.VITE_MOCK === "1";
const mockPath = fileURLToPath(new URL("./src/mockFirestore.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: mock
      ? [
          { find: "firebase/app", replacement: mockPath },
          { find: "firebase/firestore", replacement: mockPath },
          { find: "firebase/auth", replacement: mockPath },
        ]
      : [],
  },
});
