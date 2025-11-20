    let supabase = null;
    let currentUser = null;
    let currentChatUser = null;
    let messagesSubscription = null;

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

    // Initialize with built-in Supabase
    const authDiv = document.getElementById('auth');
    const appDiv = document.getElementById('app');

    // Use built-in Supabase client
    if (window.supabase) {
      supabase = window.supabase;
      authDiv.style.display = 'block';
      checkUser();
    } else {
      showToast('Supabase not available. Please check your configuration.');
    }

    // Auth
    const signInBtn = document.getElementById('sign-in-btn');
    const signUpBtn = document.getElementById('sign-up-btn');
    const signOutBtn = document.getElementById('sign-out-btn');
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const authError = document.getElementById('auth-error');

    signInBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
      }

      signInBtn.disabled = true;
      signInBtn.innerHTML = '<span class="loading"></span>';

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        showAuthError(error.message);
        signInBtn.disabled = false;
        signInBtn.textContent = defaultConfig.sign_in_button;
      } else {
        currentUser = data.user;
        showApp();
      }
    });

    signUpBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
      }

      if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
      }

      signUpBtn.disabled = true;
      signUpBtn.innerHTML = '<span class="loading"></span>';

      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });

      if (error) {
        showAuthError(error.message);
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account';
      } else {
        showToast('Account created! Please sign in.');
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account';
      }
    });

    signOutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      currentUser = null;
      authDiv.style.display = 'block';
      appDiv.style.display = 'none';
      emailInput.value = '';
      passwordInput.value = '';
    });

    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        currentUser = user;
        showApp();
      }
    }

    function showApp() {
      authDiv.style.display = 'none';
      appDiv.style.display = 'flex';
      
      document.getElementById('current-user-name').textContent = 
        currentUser.email.split('@')[0];
      document.getElementById('profileName').textContent = currentUser.email;
      document.getElementById('profileEmail').textContent = currentUser.email;
      document.getElementById('profileAvatar').textContent = 
        currentUser.email[0].toUpperCase();
      
      loadUsers();
    }

    function showAuthError(message) {
      authError.textContent = message;
      authError.style.display = 'block';
      setTimeout(() => {
        authError.style.display = 'none';
      }, 3000);
    }

    // Users
    const usersList = document.getElementById('usersList');

    async function loadUsers() {
      const { data: users, error } = await supabase.auth.admin.listUsers();
      
      if (error) {
        // If admin endpoint not available, show message
        usersList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <h3>Users List</h3>
            <p>Sign up multiple accounts to see other users here and start chatting!</p>
          </div>
        `;
        return;
      }

      const otherUsers = users.users.filter(u => u.id !== currentUser.id);
      
      if (otherUsers.length === 0) {
        usersList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <h3>No Other Users</h3>
            <p>Create another account or invite friends to start chatting!</p>
          </div>
        `;
        return;
      }

      usersList.innerHTML = otherUsers.map(user => {
        const initial = user.email[0].toUpperCase();
        const name = user.email.split('@')[0];
        return `
          <div class="user-item" data-user-id="${user.id}" data-user-email="${user.email}">
            <div class="user-avatar">
              ${initial}
              <span class="status-dot"></span>
            </div>
            <div class="user-info">
              <p class="user-name">${name}</p>
              <p class="user-status">Online</p>
            </div>
          </div>
        `;
      }).join('');

      document.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('click', () => {
          const userId = item.dataset.userId;
          const userEmail = item.dataset.userEmail;
          openChat(userId, userEmail);
        });
      });
    }

    // Navigation
    const navUsers = document.getElementById('nav-users');
    const navProfile = document.getElementById('nav-profile');
    const usersSection = document.getElementById('users');
    const profileSection = document.getElementById('profile');

    navUsers.addEventListener('click', () => {
      navUsers.classList.add('active');
      navProfile.classList.remove('active');
      usersSection.classList.add('active');
      profileSection.classList.remove('active');
    });

    navProfile.addEventListener('click', () => {
      navProfile.classList.add('active');
      navUsers.classList.remove('active');
      profileSection.classList.add('active');
      usersSection.classList.remove('active');
    });

    // Chat
    const chatView = document.getElementById('chatView');
    const backBtn = document.getElementById('backBtn');
    const chatHeaderName = document.getElementById('chatHeaderName');
    const chatHeaderAvatar = document.getElementById('chatHeaderAvatar');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    function openChat(userId, userEmail) {
      currentChatUser = { id: userId, email: userEmail };
      
      const name = userEmail.split('@')[0];
      const initial = userEmail[0].toUpperCase();
      
      chatHeaderName.textContent = name;
      chatHeaderAvatar.textContent = initial;
      
      chatView.classList.add('active');
      loadMessages(userId);
      subscribeToMessages(userId);
    }

    backBtn.addEventListener('click', () => {
      chatView.classList.remove('active');
      if (messagesSubscription) {
        supabase.removeChannel(messagesSubscription);
        messagesSubscription = null;
      }
      currentChatUser = null;
    });

    async function loadMessages(otherUserId) {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h3>Couldn't Load Messages</h3>
            <p>Make sure you've set up the database correctly. See setup instructions.</p>
          </div>
        `;
        return;
      }

      if (messages.length === 0) {
        messagesContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👋</div>
            <h3>Start Chatting</h3>
            <p>Send a message to get the conversation started!</p>
          </div>
        `;
      } else {
        renderMessages(messages);
      }
    }

    function renderMessages(messages) {
      messagesContainer.innerHTML = messages.map(msg => {
        const isSent = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `
          <div class="message ${isSent ? 'sent' : 'received'}">
            ${msg.content}
            <div class="message-meta">${time}</div>
          </div>
        `;
      }).join('');
      
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function subscribeToMessages(otherUserId) {
      messagesSubscription = supabase
        .channel('messages')
        .on('postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages',
            filter: `sender_id=eq.${otherUserId}`
          }, 
          payload => {
            if (payload.new.receiver_id === currentUser.id) {
              appendMessage(payload.new, false);
            }
          }
        )
        .subscribe();
    }

    function appendMessage(message, isSent) {
      const time = new Date(message.created_at).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // Remove empty state if exists
      const emptyState = messagesContainer.querySelector('.empty-state');
      if (emptyState) {
        emptyState.remove();
      }
      
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
      messageDiv.innerHTML = `
        ${message.content}
        <div class="message-meta">${time}</div>
      `;
      
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async function sendMessage() {
      const content = messageInput.value.trim();
      
      if (!content || !currentChatUser) return;

      sendBtn.disabled = true;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          content,
          sender_id: currentUser.id,
          receiver_id: currentChatUser.id
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        showToast('Failed to send message');
      } else {
        appendMessage(data, true);
        messageInput.value = '';
      }

      sendBtn.disabled = false;
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });

    // Toast
    function showToast(message) {
      const existingToast = document.querySelector('.toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 3000);
    }

    // Element SDK
    async function onConfigChange(config) {
      const appTitle = document.getElementById('appTitle');
      const authTitle = document.getElementById('authTitle');
      const authSubtitle = document.getElementById('authSubtitle');
      const primaryColor = config.primary_color || defaultConfig.primary_color;
      const secondaryColor = config.secondary_color || defaultConfig.secondary_color;
      const backgroundColor = config.background_color || defaultConfig.background_color;
      const textColor = config.text_color || defaultConfig.text_color;
      const customFont = config.font_family || defaultConfig.font_family;
      const baseSize = config.font_size || defaultConfig.font_size;

      if (appTitle) appTitle.textContent = config.app_title || defaultConfig.app_title;
      if (authTitle) authTitle.textContent = config.app_title || defaultConfig.app_title;
      if (authSubtitle) authSubtitle.textContent = config.welcome_message || defaultConfig.welcome_message;
      if (signInBtn) signInBtn.textContent = config.sign_in_button || defaultConfig.sign_in_button;
      if (signOutBtn) signOutBtn.textContent = config.sign_out_button || defaultConfig.sign_out_button;
      if (sendBtn) sendBtn.textContent = config.send_button || defaultConfig.send_button;

      document.body.style.background = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
      
      const headers = document.querySelectorAll('.mobile-header, .chat-header');
      headers.forEach(el => el.style.background = primaryColor);

      const navItems = document.querySelectorAll('.nav-item.active');
      navItems.forEach(el => el.style.color = primaryColor);

      const buttons = document.querySelectorAll('.btn:not(.red):not(.secondary)');
      buttons.forEach(el => {
        el.style.background = primaryColor;
        el.style.fontFamily = `${customFont}, -apple-system, sans-serif`;
        el.style.fontSize = `${baseSize}px`;
      });

      const sentMessages = document.querySelectorAll('.message.sent');
      sentMessages.forEach(el => el.style.background = primaryColor);

      const sendBtnMobile = document.querySelectorAll('.send-btn-mobile');
      sendBtnMobile.forEach(el => el.style.background = primaryColor);

      document.body.style.fontFamily = `${customFont}, -apple-system, sans-serif`;
      document.body.style.fontSize = `${baseSize}px`;
    }

    if (window.elementSdk) {
      window.elementSdk.init({
        defaultConfig,
        onConfigChange,
        mapToCapabilities: (config) => ({
          recolorables: [
            {
              get: () => config.primary_color || defaultConfig.primary_color,
              set: (value) => {
                config.primary_color = value;
                window.elementSdk.setConfig({ primary_color: value });
              }
            },
            {
              get: () => config.secondary_color || defaultConfig.secondary_color,
              set: (value) => {
                config.secondary_color = value;
                window.elementSdk.setConfig({ secondary_color: value });
              }
            },
            {
              get: () => config.background_color || defaultConfig.background_color,
              set: (value) => {
                config.background_color = value;
                window.elementSdk.setConfig({ background_color: value });
              }
            },
            {
              get: () => config.text_color || defaultConfig.text_color,
              set: (value) => {
                config.text_color = value;
                window.elementSdk.setConfig({ text_color: value });
              }
            }
          ],
          borderables: [],
          fontEditable: {
            get: () => config.font_family || defaultConfig.font_family,
            set: (value) => {
              config.font_family = value;
              window.elementSdk.setConfig({ font_family: value });
            }
          },
          fontSizeable: {
            get: () => config.font_size || defaultConfig.font_size,
            set: (value) => {
              config.font_size = value;
              window.elementSdk.setConfig({ font_size: value });
            }
          }
        }),
        mapToEditPanelValues: (config) => new Map([
          ["app_title", config.app_title || defaultConfig.app_title],
          ["welcome_message", config.welcome_message || defaultConfig.welcome_message],
          ["sign_in_button", config.sign_in_button || defaultConfig.sign_in_button],
          ["sign_out_button", config.sign_out_button || defaultConfig.sign_out_button],
          ["send_button", config.send_button || defaultConfig.send_button]
        ])
      });
    }
