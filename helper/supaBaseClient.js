import { createClient } from "@supabase/supabase-js";

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAdmin = process.env.SUPBASE_ADMIN_KEY;

const supabase = createClient(supabaseUrl, supabaseAdmin);

export default supabase;