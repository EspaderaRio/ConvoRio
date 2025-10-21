// app.js - main app logic (ES module)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

/*
  REPLACE these with values from your Supabase project settings:
*/
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // keeps user logged in after reload
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// 🧩 State
let currentUser = null
let selectedUser = null

// 🧩 Elements
const authDiv = document.getElementById('auth')
const chatDiv = document.getElementById('chat')
const userList = document.getElementById('user-list')
const messagesDiv = document.getElementById('messages')
const messageBox = document.getElementById('message-box')
const messageInput = document.getElementById('message-input')
const chatWith = document.getElementById('chat-with')

// 🧩 Buttons
document.getElementById('sign-in-btn').onclick = signIn
document.getElementById('sign-out-btn').onclick = signOut
document.getElementById('send-btn').onclick = sendMessage

// ✅ Google sign-in
async function signIn() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://espaderario.github.io/ConvoRio/',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
}

// ✅ Sign out
async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) console.error('Sign-out error:', error.message)
  currentUser = null
  selectedUser = null
  chatDiv.classList.add('hidden')
  authDiv.classList.remove('hidden')
  console.log('Signed out')
}

// ✅ Ensure user profile exists (now using UPSERT)
async function ensureUserProfile(user) {
  if (!user) return
  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      name: user.user_metadata.full_name || user.email,
      avatar_url: user.user_metadata.avatar_url || null,
    },
    { onConflict: 'id' } // prevents duplicate key errors
  )
  if (error) console.error('Profile upsert error:', error.message)
}

// ✅ Load all users except self
async function loadUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', currentUser.id)
    .order('name', { ascending: true })

  userList.innerHTML = ''

  if (error) {
    console.error(error.message)
    return
  }

  if (!data.length) {
    userList.innerHTML = '<li>No other users yet</li>'
    return
  }

  data.forEach((u) => {
    const li = document.createElement('li')
    li.textContent = u.name || u.email
    li.onclick = () => selectUser(u)
    userList.appendChild(li)
  })
}

function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name || user.email}`
  messageBox.classList.remove('hidden')
  loadMessages()
}

// ✅ Send message
async function sendMessage() {
  const text = messageInput.value.trim()
  if (!text || !selectedUser || !currentUser) return

  const { error } = await supabase.from('messages').insert([
    {
      sender_id: currentUser.id,
      receiver_id: selectedUser.id,
      content: text,
    },
  ])

  if (error) console.error(error.message)
  else messageInput.value = ''
}

// ✅ Load conversation
async function loadMessages() {
  if (!selectedUser) return
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
    )
    .order('created_at', { ascending: true })

  messagesDiv.innerHTML = ''

  if (error) {
    console.error(error.message)
    return
  }

  data.forEach((msg) => {
    const p = document.createElement('p')
    p.textContent = `${
      msg.sender_id === currentUser.id ? 'You' : selectedUser.name || 'Them'
    }: ${msg.content}`
    messagesDiv.appendChild(p)
  })

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// ✅ Real-time updates
supabase
  .channel('messages-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      const msg = payload.new
      if (
        (msg.sender_id === currentUser?.id && msg.receiver_id === selectedUser?.id) ||
        (msg.sender_id === selectedUser?.id && msg.receiver_id === currentUser?.id)
      ) {
        loadMessages()
      }
    }
  )
  .subscribe()

// ✅ Handle auth changes (login / logout)
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    authDiv.classList.add('hidden')
    chatDiv.classList.remove('hidden')
    await loadUsers()
  }

  if (event === 'SIGNED_OUT') {
    currentUser = null
    selectedUser = null
    chatDiv.classList.add('hidden')
    authDiv.classList.remove('hidden')
  }
})

// ✅ Initial check on page load
;(async function init() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    authDiv.classList.add('hidden')
    chatDiv.classList.remove('hidden')
    await loadUsers()
  } else {
    authDiv.classList.remove('hidden')
  }
})()
