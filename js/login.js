document.addEventListener('DOMContentLoaded', async () => {
  let msalInstance = null;
  let authConfig = null;

  // Initialize authentication configuration
  try {
    const configResponse = await fetch('/api/auth-config');
    authConfig = await configResponse.json();
    
    if (authConfig.hasSSO) {
      document.getElementById('sso-section').classList.remove('hidden');
      await initializeMSAL();
    }
  } catch (error) {
    console.warn('Could not load auth config, using demo mode only');
  }

  async function initializeMSAL() {
    try {
      const msalResponse = await fetch('/auth/microsoft');
      if (msalResponse.ok) {
        const msalConfig = await msalResponse.json();
        
        msalInstance = new msal.PublicClientApplication({
          auth: {
            clientId: msalConfig.msalConfig.auth.clientId,
            authority: msalConfig.msalConfig.auth.authority,
            redirectUri: msalConfig.msalConfig.auth.redirectUri
          },
          cache: {
            cacheLocation: "sessionStorage",
            storeAuthStateInCookie: false
          }
        });

        await msalInstance.initialize();
        
        // Handle redirect response if coming back from Microsoft
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
          await handleMicrosoftLogin(response);
        }
      }
    } catch (error) {
      console.error('Microsoft SSO initialization failed:', error);
      showStatus('Microsoft SSO niet beschikbaar, gebruik demo-modus', 'error');
    }
  }

  // Microsoft login button
  document.getElementById('microsoft-login-btn')?.addEventListener('click', async () => {
    if (!msalInstance) {
      showStatus('Microsoft SSO niet beschikbaar', 'error');
      return;
    }

    try {
      const loginRequest = {
        scopes: ["openid", "profile", "email"],
        prompt: "select_account"
      };
      
      await msalInstance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Microsoft login failed:', error);
      showStatus('Microsoft inloggen mislukt', 'error');
    }
  });

  async function handleMicrosoftLogin(response) {
    try {
      const backendResponse = await fetch('/auth/microsoft/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${response.accessToken}`
        },
        body: JSON.stringify({
          account: response.account,
          accessToken: response.accessToken
        })
      });

      if (backendResponse.ok) {
        const data = await backendResponse.json();
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        showStatus(data.message || 'Succesvol ingelogd via Microsoft', 'success');
        setTimeout(() => window.location.href = 'index.html', 1000);
      } else {
        throw new Error('Backend authentication failed');
      }
    } catch (error) {
      console.error('Microsoft callback failed:', error);
      showStatus('Microsoft authenticatie mislukt', 'error');
    }
  }

  // Demo login form
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const useDemo = document.getElementById('demo-mode').checked;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, useDemo }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        showStatus(data.message || 'Succesvol ingelogd', 'success');
        setTimeout(() => window.location.href = 'index.html', 1000);
      } else if (data.requireSSO) {
        showStatus('Microsoft SSO vereist. Gebruik de Microsoft-knop hierboven.', 'error');
      } else {
        showStatus(data.error || 'Inloggen mislukt', 'error');
      }
    } catch (err) {
      console.error('Login error:', err);
      showStatus('Netwerkfout bij inloggen', 'error');
    }
  });

  function showStatus(message, type) {
    const statusDiv = document.getElementById('login-status');
    const messageEl = document.getElementById('status-message');
    
    messageEl.textContent = message;
    statusDiv.className = `mt-4 p-4 rounded-md ${
      type === 'success' 
        ? 'bg-green-100 border border-green-400 text-green-700' 
        : 'bg-red-100 border border-red-400 text-red-700'
    }`;
    statusDiv.classList.remove('hidden');
    
    if (type === 'success') {
      setTimeout(() => statusDiv.classList.add('hidden'), 3000);
    }
  }
});
