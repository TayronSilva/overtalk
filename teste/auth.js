// auth.js - Config compartilhada do Supabase
// Carregar antes: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js">

const SUPABASE_URL = 'https://nzcciwoxtnfeixphsmro.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ze6xS2HlVCV-05-rieBHUA_hOe9t3nZ';

window.__sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Login com Google (redireciona para URL de callback)
async function signInWithGoogle() {
  const { error } = await window.__sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/teste/dashboard.html'
    }
  });
  if (error) alert('Erro Google: ' + error.message);
}

// Login email/senha
async function signInWithEmail(email, password) {
  const { data, error } = await window.__sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Criar conta email/senha
async function signUpWithEmail(email, password) {
  const { data, error } = await window.__sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/teste/dashboard.html' } });
  if (error) throw error;
  return data;
}

// Ver sessão
async function checkSession() {
  const { data } = await window.__sb.auth.getSession();
  return data.session;
}

// Logout
async function signOut() {
  await window.__sb.auth.signOut();
  window.location.href = 'landing.html';
}
