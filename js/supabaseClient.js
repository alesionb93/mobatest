import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_MOCK_BACKEND } from './config.js';
import { createMockSupabaseClient } from './mockBackend.js';

let client;

if (USE_MOCK_BACKEND) {
  console.info('[Mobatest] Rodando em modo demonstração — dados salvos só em memória (somem ao atualizar a página).');
  client = createMockSupabaseClient();
} else {
  if (SUPABASE_URL.includes('COLE_AQUI') || SUPABASE_ANON_KEY.includes('COLE_AQUI')) {
    console.warn(
      '[Mobatest] Configure suas credenciais do Supabase em js/config.js antes de usar a aplicação.'
    );
  }
  try {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    // Evita tela preta silenciosa: mostra o erro de forma visível na página.
    document.body.innerHTML = `
      <div style="max-width:560px; margin:60px auto; padding:24px; font-family:sans-serif; background:#1a222b; color:#ff5c5c; border-radius:12px; border:1px solid #ff5c5c;">
        <h2 style="margin-top:0;">Não foi possível conectar ao Supabase</h2>
        <p style="color:#e6edf3;">Verifique se <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>js/config.js</code> estão preenchidos corretamente (não podem ficar com o texto de exemplo "COLE_AQUI...").</p>
        <p style="color:#8b98a5; font-size:13px;">Detalhe técnico: ${err.message}</p>
      </div>
    `;
    throw err;
  }
}

export const supabase = client;
