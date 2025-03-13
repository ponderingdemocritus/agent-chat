import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Check if Supabase is properly configured
if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials not found. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables."
  );
}
