// script.js — ConvoRio Updated: Real-Time Messaging Fix

// ---------- Config ----------
const USE_WINDOW_SUPABASE = !!window.supabase;
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c';

// ---------- App state ----------
let supabase = null;
let currentUser = null;
let currentChatUser = null;
let messagesSubscription = null;
const displayedMessages = new Set();

const defaultConfig = {
  app_title: "Messages",
  welcome_message: "Sign in to start chatting with others in real-time",
  sign_in_button: "Sign In",
  sign_out_button: "Sign Out",
  send_button: "➤",
  primary_color: "#667eea",
  secondary_color: "#764ba2",
  background_color: "#ffffff",
  text_color: "#1a1a1a",
  font_family: "system-ui",
  font_size: 16
};

// ---------- DOM Ready ----------
window.addEventListener('DOMContentLoaded', async () => {
  // ---------- Init Supabase ----------
  if (USE_WINDOW_SUPABASE) {
    supabase = window.supabase;
  } else {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.33.0');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  // ---------- DOM Elements ----------
  const authDiv = document.getElementById('auth');
  const appDiv = document.getElementById('app');
  const signInBtn = document.getElementById('sign-in-btn');
  const signUpBtn = document.getElementById('sign-up-btn');
  const signOutBtn = document.getElementById('sign-out-btn');
  const googleBtn = document.getElementById('sign-in-google-btn');
  const emailInput = document.getElementById('email-input');
  const passwordInput = document.getElementById('password-input');
  const authError = document.getElementById('auth-error');
  const usersList = document.getElementById('usersList');
  const navUsers = document.getElementById('nav-users');
  const navProfile = document.getElementById('nav-profile');
  const usersSection = document.getElementById('users');
  const profileSection = document.getElementById('profile');
  const chatView = document.getElementById('chatView');
  const backBtn = document.getElementById('backBtn');
  const chatHeaderName = document.getElementById('chatHeaderName');
  const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
  const messagesContainer = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const currentUserNameEl = document.getElementById('current-user-name');
  const profileNameEl = document.getElementById('profileName');
  const profileEmailEl = document.getElementById('profileEmail');
  const profileAvatarEl = document.getElementById('profileAvatar');

  if (!supabase) { console.error('Supabase client not available'); return; }

  // ---------- Helpers ----------
  function showToast(msg) {
    const ex = document.querySelector('.toast'); if (ex) ex.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
  }

  function showAuthError(message) {
    if (!authError) return console.error('authError element missing:', message);
    authError.textContent = message; authError.style.display = 'block';
    setTimeout(() => (authError.style.display = 'none'), 3500);
  }

  // ---------- Auth ----------
  async function signInWithEmail(email, password) {
    return await supabase.auth.signInWithPassword({ email, password });
  }

  async function signUpWithEmail(email, password) {
    return await supabase.auth.signUp({ email, password });
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) showAuthError(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    currentUser = null;
    cleanupRealtime();
    showAuth();
  }

  // ---------- Profiles ----------
  async function ensureProfileRow(user) {
    if (!user) return;
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
      avatar_url: user.user_metadata?.avatar_url || null
    }, { onConflict: 'id' });
    if (error) console.warn('ensureProfileRow error:', error.message);
  }

  async function loadProfilesList() {
    const { data, error } = await supabase.from('profiles')
      .select('id,name,email,avatar_url')
      .order('name', { ascending: true });
    if (error) {
      console.warn('Could not load profiles:', error.message);
      usersList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>Users List</h3><p>Unable to fetch users.</p></div>`;
      return;
    }
    const others = (data || []).filter(p => p.id !== currentUser?.id);
    if (!others.length) {
      usersList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>No Other Users</h3><p>Create another account to start chatting.</p></div>`;
      return;
    }
    usersList.innerHTML = others.map(u => {
      const initial = (u.email || u.name || '?')[0]?.toUpperCase() || '?';
      const displayName = u.name || u.email.split('@')[0];
      return `<div class="user-item" data-user-id="${u.id}" data-user-email="${u.email}">
          <div class="user-avatar">${initial}<span class="status-dot"></span></div>
          <div class="user-info"><p class="user-name">${displayName}</p><p class="user-status">Online</p></div>
        </div>`;
    }).join('');
    document.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => openChat(item.dataset.userId, item.dataset.userEmail));
    });
  }

  // ---------- UI ----------
  function showApp() {
    authDiv.style.display = 'none'; appDiv.style.display = 'flex';
    currentUserNameEl && (currentUserNameEl.textContent = currentUser.email.split('@')[0]);
    profileNameEl && (profileNameEl.textContent = currentUser.email.split('@')[0]);
    profileEmailEl && (profileEmailEl.textContent = currentUser.email);
    profileAvatarEl && (profileAvatarEl.textContent = currentUser.email[0].toUpperCase());
    loadProfilesList();
  }

  function showAuth() {
    authDiv.style.display = 'block'; appDiv.style.display = 'none';
  }

  // ---------- Auth Event Handlers ----------
  signInBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim(); const password = passwordInput.value;
    if (!email || !password) return showAuthError('Enter email and password');
    signInBtn.disabled = true; signInBtn.innerHTML = '<span class="loading"></span>';
    const { data, error } = await signInWithEmail(email, password);
    signInBtn.disabled = false; signInBtn.textContent = defaultConfig.sign_in_button;
    if (error) return showAuthError(error.message);
    currentUser = data.user;
    await ensureProfileRow(currentUser);
    showApp();
  });

  signUpBtn?.addEventListener('click', async () => {
    const email = emailInput.value.trim(); const password = passwordInput.value;
    if (!email || !password) return showAuthError('Enter email and password');
    if (password.length < 6) return showAuthError('Password must be at least 6 characters');
    signUpBtn.disabled = true; signUpBtn.innerHTML = '<span class="loading"></span>';
    const { data, error } = await signUpWithEmail(email, password);
    signUpBtn.disabled = false; signUpBtn.textContent = 'Create Account';
    if (error) return showAuthError(error.message);
    showToast('Account created! Check email for confirmation.');
  });

  googleBtn?.addEventListener('click', signInWithGoogle);
  signOutBtn?.addEventListener('click', signOut);

  // ---------- Navigation ----------
  navUsers?.addEventListener('click', () => {
    navUsers.classList.add('active'); navProfile.classList.remove('active');
    usersSection.classList.add('active'); profileSection.classList.remove('active');
  });
  navProfile?.addEventListener('click', () => {
    navProfile.classList.add('active'); navUsers.classList.remove('active');
    profileSection.classList.add('active'); usersSection.classList.remove('active');
  });

  // ---------- Messaging ----------
  function openChat(userId, userEmail) {
    currentChatUser = { id: userId, email: userEmail };
    chatHeaderName.textContent = userEmail.split('@')[0];
    chatHeaderAvatar.textContent = (userEmail[0] || '?').toUpperCase();
    chatView.classList.add('active'); displayedMessages.clear();
    loadMessages(userId); subscribeToMessages(userId);
  }

  backBtn?.addEventListener('click', () => {
    chatView.classList.remove('active'); cleanupRealtime(); currentChatUser = null;
  });

  async function loadMessages(otherUserId) {
    if (!currentUser) return;
    try {
      const { data: messages, error } = await supabase.from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });
      if (error) throw error;

      messagesContainer.innerHTML = ''; displayedMessages.clear();

      if (!messages?.length) {
        messagesContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👋</div><h3>Start Chatting</h3><p>Send a message to get the conversation started!</p></div>`;
      } else messages.forEach(msg => appendMessage(msg, msg.sender_id === currentUser.id));
    } catch (err) {
      console.error('Error loading messages:', err);
      messagesContainer.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><h3>Couldn't Load Messages</h3><p>Check database or RLS policies.</p></div>`;
    }
  }

  function subscribeToMessages(otherUserId) {
    cleanupRealtime();
    messagesSubscription = supabase.channel(`messages:${currentUser.id}:${otherUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `or(and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id}))`
      }, payload => appendMessage(payload.new, payload.new.sender_id === currentUser.id))
      .subscribe();
  }

function appendMessage(message, isSent) {
  if (displayedMessages.has(message.id)) return;
  displayedMessages.add(message.id);

  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const emptyState = messagesContainer.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  messageDiv.setAttribute('data-id', message.id); // Add this line
  messageDiv.innerHTML = `${message.content}<div class="message-meta">${time}</div>`;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !currentChatUser || sendBtn.disabled) return;

  // Disable button while sending
  sendBtn.disabled = true;

  // Optimistically append message to chat immediately
  const tempId = 'temp-' + Date.now();
  const now = new Date();
  const tempMessage = {
    id: tempId,
    content,
    sender_id: currentUser.id,
    receiver_id: currentChatUser.id,
    created_at: now.toISOString()
  };
  appendMessage(tempMessage, true);
  messageInput.value = '';

  try {
    const { data, error } = await supabase.from('messages').insert({
      content,
      sender_id: currentUser.id,
      receiver_id: currentChatUser.id
    }).select().single();

    if (error) throw error;

    // Replace temp message ID with real one from DB
    displayedMessages.delete(tempId);
    appendMessage(data, true);

  } catch (err) {
    console.error('Error sending message:', err);
    showToast('Failed to send message');
    // Remove temp message from chat if failed
    displayedMessages.delete(tempId);
    const msgEl = messagesContainer.querySelector(`.message[data-id="${tempId}"]`);
    if (msgEl) msgEl.remove();
  } finally {
    sendBtn.disabled = false;
  }
}


  function cleanupRealtime() {
    if (messagesSubscription) { try { supabase.removeChannel(messagesSubscription); } catch {} messagesSubscription = null; }
  }

  sendBtn?.addEventListener('click', sendMessage);
  messageInput?.addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); sendMessage(); } });

  // ---------- Session startup ----------
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) { currentUser = session.user; await ensureProfileRow(currentUser); showApp(); } 
    else showAuth();
  } catch (e) { console.error('getSession error:', e); showAuth(); }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) { currentUser = session.user; await ensureProfileRow(currentUser); showApp(); } 
    else { currentUser = null; cleanupRealtime(); showAuth(); }
  });

  // ---------- Element SDK ----------
  async function onConfigChange(config) {
    const primaryColor = config.primary_color || defaultConfig.primary_color;
    const secondaryColor = config.secondary_color || defaultConfig.secondary_color;
    const customFont = config.font_family || defaultConfig.font_family;
    const baseSize = config.font_size || defaultConfig.font_size;

    document.body.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
    document.body.style.fontFamily = `${customFont}, -apple-system, sans-serif`;
    document.body.style.fontSize = `${baseSize}px`;
    document.querySelectorAll('.btn:not(.red):not(.secondary)').forEach(el => {
      el.style.background = primaryColor;
      el.style.fontFamily = `${customFont}, -apple-system, sans-serif`;
      el.style.fontSize = `${baseSize}px`;
    });
    document.querySelectorAll('.message.sent').forEach(el => el.style.background = primaryColor);
    document.querySelectorAll('.mobile-header, .chat-header').forEach(el => el.style.background = primaryColor);

    document.getElementById('appTitle').textContent = config.app_title || defaultConfig.app_title;
    document.getElementById('authTitle').textContent = config.app_title || defaultConfig.app_title;
    document.getElementById('authSubtitle').textContent = config.welcome_message || defaultConfig.welcome_message;
    if (signInBtn) signInBtn.textContent = config.sign_in_button || defaultConfig.sign_in_button;
    if (signOutBtn) signOutBtn.textContent = config.sign_out_button || defaultConfig.sign_out_button;
    if (sendBtn) sendBtn.textContent = config.send_button || defaultConfig.send_button;
  }

  if (window.elementSdk) window.elementSdk.init({ defaultConfig, onConfigChange });
});
