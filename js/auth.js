import { supabase } from './supabaseClient.js';
import { toast, initials, setLoading } from './ui.js';
import { USE_MOCK_BACKEND } from './config.js';

export let currentUser = null;
export let currentProfile = null;

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function initAuthUI(onAuthenticated) {
  const authScreen = document.getElementById('auth-screen');
  const appRoot = document.getElementById('app');

  const session = await getSession();

  if (session) {
    await hydrateUser(session);
    authScreen.classList.add('hidden');
    appRoot.classList.remove('hidden');
    onAuthenticated();
  } else {
    authScreen.classList.remove('hidden');
    appRoot.classList.add('hidden');
  }

  supabase.auth.onAuthStateChange(async (event, newSession) => {
    if (event === 'SIGNED_IN' && newSession) {
      await hydrateUser(newSession);
      authScreen.classList.add('hidden');
      appRoot.classList.remove('hidden');
      onAuthenticated();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      authScreen.classList.remove('hidden');
      appRoot.classList.add('hidden');
    }
    if (event === 'PASSWORD_RECOVERY') {
      // Usuário clicou no link do e-mail de recuperação — mostra a
      // tela de "definir nova senha" em vez do login normal.
      authScreen.classList.remove('hidden');
      appRoot.classList.add('hidden');
      showAuthForm('reset-form');
    }
  });

  wireForms();
}

async function hydrateUser(session) {
  currentUser = session.user;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();
  currentProfile = profile || { full_name: currentUser.email, id: currentUser.id };

  document.getElementById('user-name').textContent = currentProfile.full_name || currentUser.email;
  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('user-avatar').textContent = initials(currentProfile.full_name || currentUser.email);

  // Marca presença — usado na coluna "Última ação" da tela de Equipe.
  // Não precisa bloquear a tela esperando, mas o .then() é necessário:
  // sem ele (ou um await), o Supabase nunca dispara a requisição de fato.
  supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', currentUser.id).then(() => {});
}

const AUTH_FORM_IDS = ['login-form', 'signup-form', 'forgot-form', 'reset-form'];

function showAuthForm(formId) {
  AUTH_FORM_IDS.forEach((id) => document.getElementById(id).classList.toggle('hidden', id !== formId));
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('toggle-to-signup').classList.toggle('hidden', formId !== 'login-form');
  document.getElementById('toggle-to-login').classList.toggle('hidden', formId !== 'signup-form');
}

function wireForms() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotForm = document.getElementById('forgot-form');
  const resetForm = document.getElementById('reset-form');
  const toggleToSignup = document.getElementById('toggle-to-signup');
  const toggleToLogin = document.getElementById('toggle-to-login');
  const toggleToForgot = document.getElementById('toggle-to-forgot');
  const toggleToLoginFromForgot = document.getElementById('toggle-to-login-from-forgot');
  const errorBox = document.getElementById('auth-error');
  const logoutBtn = document.getElementById('logout-btn');

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
  }
  function clearError() {
    errorBox.classList.add('hidden');
  }

  toggleToSignup.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('signup-form');
  });

  toggleToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('login-form');
  });

  toggleToForgot.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('forgot-form');
  });

  toggleToLoginFromForgot.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm('login-form');
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = loginForm.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Entrando...');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(btn, false);
    if (error) {
      showError(traduzErro(error.message));
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = signupForm.querySelector('button[type="submit"]');
    setLoading(btn, true, 'Criando...');
    const full_name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    setLoading(btn, false);
    if (error) {
      showError(traduzErro(error.message));
    } else {
      toast('Conta criada! Verifique seu e-mail se a confirmação estiver ativada.');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('forgot-btn-text').closest('button');
    setLoading(btn, true, 'Enviando...');
    const email = document.getElementById('forgot-email').value.trim();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    setLoading(btn, false);
    if (error) {
      showError(traduzErro(error.message));
    } else {
      toast(USE_MOCK_BACKEND
        ? 'Modo demonstração: nenhum e-mail real é enviado aqui.'
        : 'Se esse e-mail tiver uma conta, enviamos um link de recuperação.');
      showAuthForm('login-form');
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('reset-btn-text').closest('button');
    setLoading(btn, true, 'Salvando...');
    const password = document.getElementById('reset-password').value;

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(btn, false);
    if (error) {
      showError(traduzErro(error.message));
    } else {
      toast('Senha atualizada! Você já está logado.');
    }
  });

  document.querySelectorAll('.password-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.title = showing ? 'Mostrar senha' : 'Ocultar senha';
      btn.classList.toggle('is-showing', !showing);
    });
  });
}

function traduzErro(msg) {
  const map = {
    'Invalid login credentials': 'E-mail ou senha inválidos.',
    'User already registered': 'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha deve ter ao menos 6 caracteres.',
  };
  return map[msg] || msg;
}
