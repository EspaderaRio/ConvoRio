import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

let currentUser = null
let selectedUser = null

// Elements
const authDiv = document.getElementById('auth')
const appDiv = document.getElementById('app')
const chatDiv = document.getElementById('chat')
const profileDiv = document.getElementById('profile')
const userList = document.getElementById('user-list')
const messagesDiv = document.getElementById('messages')
const messageBox = document.getElementById('message-box')
const messageInput = document.getElementById('message-input')
const chatWith = document.getElementById('chat-with')
const profileName = document.getElementById('profile-name')
const profileAvatarInput = document.getElementById('profile-avatar')
const currentAvatar = document.getElementById('current-avatar')

// Tab buttons
document.getElementById('tab-chat').onclick = () => { chatDiv.classList.remove('hidden'); profileDiv.classList.add('hidden') }
document.getElementById('tab-profile').onclick = () => { profileDiv.classList.remove('hidden'); chatDiv.classList.add('hidden') }

// Buttons
document.getElementById('sign-in-btn').onclick = signIn
document.getElementById('sign-out-btn').onclick = signOut
document.getElementById('send-btn').onclick = sendMessage
document.getElementById('save-profile-btn').onclick = saveProfile

// ✅ Google Sign-in
async function signIn() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://espaderario.github.io/ConvoRio/' }
  })
}

// ✅ Sign out
async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  selectedUser = null
  appDiv.classList.add('hidden')
  authDiv.classList.remove('hidden')
}

// ✅ Ensure user profile exists
async function ensureUserProfile(user) {
  if (!user) return
  await supabase.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      name: user.user_metadata.full_name || user.email,
      avatar_url: user.user_metadata.avatar_url || null
    },
    { onConflict: 'id' }
  )
}

// ✅ Load users
async function loadUsers() {
  const { data } = await supabase.from('profiles').select('*').neq('id', currentUser.id).order('name', { ascending: true })
  userList.innerHTML = ''
  if (!data.length) userList.innerHTML = '<li>No other users</li>'
  data.forEach(u => {
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
  await supabase.from('messages').insert([{ sender_id: currentUser.id, receiver_id: selectedUser.id, content: text }])
  messageInput.value = ''
}

// ✅ Load messages with avatars & timestamps
async function loadMessages() {
  if (!selectedUser) return
  const { data } = await supabase
    .from('messages')
    .select('*, sender:profiles(id, name, avatar_url)')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true })

  messagesDiv.innerHTML = ''
  data.forEach(msg => {
    const msgDiv = document.createElement('div')
    msgDiv.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')
    const avatar = document.createElement('img')
    avatar.classList.add('avatar')
    avatar.src = msg.sender.avatar_url || 'default-avatar.png'
    const textDiv = document.createElement('div')
    textDiv.classList.add('text')
    textDiv.textContent = msg.content
    const timeDiv = document.createElement('div')
    timeDiv.classList.add('timestamp')
    timeDiv.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    msgDiv.append(avatar, textDiv, timeDiv)
    messagesDiv.appendChild(msgDiv)
  })
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// ✅ Real-time messages
supabase.channel('messages-channel').on(
  'postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'messages' },
  payload => {
    const msg = payload.new
    if ((msg.sender_id === currentUser?.id && msg.receiver_id === selectedUser?.id) || (msg.sender_id === selectedUser?.id && msg.receiver_id === currentUser?.id)) loadMessages()
  }
).subscribe()

// ✅ Save profile updates
async function saveProfile() {
  let avatarUrl = currentUser.user_metadata.avatar_url
  if (profileAvatarInput.files.length > 0) {
    const file = profileAvatarInput.files[0]
    const fileExt = file.name.split('.').pop()
    const filePath = `${currentUser.id}.${fileExt}`
    const { data, error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (uploadError) return console.error(uploadError.message)
    const { publicUrl } = supabase.storage.from('avatars').getPublicUrl(filePath)
    avatarUrl = publicUrl
  }
  await supabase.from('profiles').update({ name: profileName.value, avatar_url: avatarUrl }).eq('id', currentUser.id)
  currentAvatar.src = avatarUrl
  await loadUsers()
}

// ✅ Handle auth changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    authDiv.classList.add('hidden')
    appDiv.classList.remove('hidden')
    profileName.value = currentUser.user_metadata.full_name || currentUser.email
    currentAvatar.src = currentUser.user_metadata.avatar_url || 'default-avatar.png'
    await loadUsers()
  }
  if (event === 'SIGNED_OUT') signOut()
})

// ✅ Initialize on page load
;(async function init() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    authDiv.classList.add('hidden')
    appDiv.classList.remove('hidden')
    profileName.value = currentUser.user_metadata.full_name || currentUser.email
    currentAvatar.src = currentUser.user_metadata.avatar_url || 'default-avatar.png'
    await loadUsers()
  }
})()
