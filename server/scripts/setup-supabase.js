#!/usr/bin/env node

/**
 * This script helps with setting up Supabase tables and policies.
 * It reads the schema.sql file and outputs instructions for setting up Supabase.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Path to the schema file
const schemaPath = path.join(__dirname, "..", "supabase", "schema.sql");

// Check if the schema file exists
if (!fs.existsSync(schemaPath)) {
  console.error("Schema file not found:", schemaPath);
  process.exit(1);
}

// Read the schema file
const schema = fs.readFileSync(schemaPath, "utf8");

console.log("\n=== Supabase Setup Instructions ===\n");
console.log("1. Create a new Supabase project at https://supabase.com");
console.log("2. Go to the SQL Editor in your Supabase dashboard");
console.log("3. Create a new query and paste the following SQL:");
console.log("\n```sql");
console.log(schema);
console.log("```\n");
console.log("4. Run the query to create the tables and policies");
console.log(
  "   Note: The script includes DROP POLICY statements to handle existing policies"
);
console.log(
  "   and error handling for realtime publication, so it's safe to run multiple times."
);
console.log("5. Get your Supabase URL and anon key from the API settings");
console.log(
  "6. Create a .env file in the server directory with the following content:"
);
console.log("\n```");
console.log("SUPABASE_URL=your_supabase_url");
console.log("SUPABASE_ANON_KEY=your_supabase_anon_key");
console.log("PORT=3000");
console.log("```\n");
console.log("7. Start the server with: npm run dev");

// Try to create a .env file if it doesn't exist
const envPath = path.join(__dirname, "..", ".env");
const envExamplePath = path.join(__dirname, "..", ".env.example");

if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  console.log("\nCreating .env file from .env.example...");
  fs.copyFileSync(envExamplePath, envPath);
  console.log(
    "Done! Please update the .env file with your Supabase credentials."
  );
}

console.log("\n=== End of Setup Instructions ===\n");
