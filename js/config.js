// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------
// 1. Crie um projeto grátis em https://supabase.com
// 2. Vá em Project Settings > API
// 3. Copie "Project URL" e "anon public key" e cole abaixo
// ============================================================

export const SUPABASE_URL = "https://fajymunojusbpastkcrh.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhanltdW5vanVzYnBhc3RrY3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MDIxOTUsImV4cCI6MjEwMzI3ODE5NX0.Ff6XHVA_vBcByN2A0Oqk4YA0wsP-vLuw5zG4yoxpVDs";

// Modo demonstração: true = usa um backend simulado em memória
// (nenhum dado é enviado à internet; tudo reseta ao atualizar a página).
// Quando você configurar suas credenciais reais do Supabase acima, troque para false.
export const USE_MOCK_BACKEND = false;
