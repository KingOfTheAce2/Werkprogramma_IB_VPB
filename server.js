import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import passport from 'passport';
import { BearerStrategy } from 'passport-azure-ad';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import bcrypt from 'bcrypt';
import validator from 'validator';

dotenv.config();

const app = express();

// Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "https://cdn.tailwindcss.com", "https://alcdn.msauth.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://login.microsoftonline.com", "https://*.microsoftonline.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Te veel verzoeken van dit IP-adres, probeer het later opnieuw.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: 'Te veel inlogpogingen, probeer het over 15 minuten opnieuw.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// CORS Configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://your-production-domain.com']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parser with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input validation middleware
function validateInput(req, res, next) {
  if (req.body) {
    // Sanitize string inputs
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = validator.escape(req.body[key].trim());
      }
    }
  }
  next();
}

app.use(validateInput);

// Session configuration for security
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'werkprogramma.sid', // Custom session name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours for security
    sameSite: 'strict'
  }
}));

// Authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authenticatie vereist' });
  }
  
  const token = authHeader.substring(7);
  const userSession = sessions.get(token);
  
  if (!userSession) {
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
  }
  
  // Check session timeout (8 hours)
  const sessionAge = Date.now() - userSession.createdAt;
  if (sessionAge > 8 * 60 * 60 * 1000) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Sessie verlopen, log opnieuw in' });
  }
  
  req.user = userSession;
  next();
}

// Role-based access control middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authenticatie vereist' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Onvoldoende rechten voor deze actie' });
    }
    
    next();
  };
}

app.use(passport.initialize());
app.use(passport.session());

// Microsoft Azure AD configuration
const azureADConfig = {
  identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}/v2.0/.well-known/openid_configuration`,
  clientID: process.env.AZURE_CLIENT_ID,
  audience: process.env.AZURE_CLIENT_ID,
  validateIssuer: false,
  scope: ['openid', 'profile', 'email']
};

// Configure Azure AD authentication strategy
if (process.env.AZURE_CLIENT_ID) {
  passport.use(new BearerStrategy(azureADConfig, (token, done) => {
    // In production, validate the token and get user info
    const userRole = determineUserRole(token.emails?.[0] || token.preferred_username);
    const user = {
      id: token.oid,
      name: token.name,
      email: token.emails?.[0] || token.preferred_username,
      role: userRole
    };
    return done(null, user);
  }));
}

// Determine user role based on email or other criteria
function determineUserRole(email) {
  if (!email) return 'opsteller';
  
  // Admin role for specific domains or users
  if (email.includes('@admin.') || email.includes('admin@')) {
    return 'admin';
  }
  
  // Reviewer role for senior users
  if (email.includes('@reviewer.') || email.includes('reviewer@') || email.includes('senior@')) {
    return 'reviewer';
  }
  
  // Default role
  return 'opsteller';
}

// Demo users for development/bypass
const demoUsers = {
  jan: { password: 'password', name: 'Jan Jansen (Belastingadviseur)', role: 'opsteller', email: 'jan@demo.nl' },
  piet: { password: 'password', name: 'Piet de Boer (Senior Adviseur)', role: 'reviewer', email: 'piet@demo.nl' },
  klaas: { password: 'password', name: 'Klaas Visser (Kantoormanager)', role: 'admin', email: 'klaas@demo.nl' },
};

const sessions = new Map();

// Microsoft SSO login initiation
app.get('/auth/microsoft', (req, res) => {
  if (!process.env.AZURE_CLIENT_ID) {
    return res.status(501).json({ error: 'Microsoft SSO niet geconfigureerd. Gebruik demo-inloggegevens.' });
  }
  
  const msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
      redirectUri: `${req.protocol}://${req.get('host')}/auth/microsoft/callback`
    }
  };
  
  res.json({ msalConfig, authUrl: `${msalConfig.auth.authority}/oauth2/v2.0/authorize` });
});

// Microsoft SSO callback
app.post('/auth/microsoft/callback', passport.authenticate('oauth-bearer', { session: false }), (req, res) => {
  const token = uuidv4();
  sessions.set(token, req.user);
  res.json({ 
    token, 
    user: req.user,
    message: 'Succesvol ingelogd via Microsoft SSO'
  });
});

// Demo/bypass login
app.post('/api/login', authLimiter, async (req, res) => {
  const { username, password, useDemo } = req.body;
  
  // Input validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn vereist' });
  }

  if (!validator.isLength(username, { min: 1, max: 50 }) || !validator.isLength(password, { min: 1, max: 100 })) {
    return res.status(400).json({ error: 'Ongeldige invoer' });
  }

  // Check if this is a demo login request
  if (useDemo === true || !process.env.AZURE_CLIENT_ID) {
    const user = demoUsers[username];
    if (!user || user.password !== password) {
      // Log failed attempt for security monitoring
      console.warn(`Failed login attempt for user: ${username} from IP: ${req.ip}`);
      return res.status(401).json({ error: 'Ongeldige inloggegevens' });
    }
    
    const token = uuidv4();
    const userSession = { 
      id: username, 
      name: user.name, 
      role: user.role,
      email: user.email,
      authMethod: 'demo',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      ip: req.ip
    };
    sessions.set(token, userSession);
    
    // Log successful login
    console.log(`Successful demo login for user: ${username} from IP: ${req.ip}`);
    
    res.json({ 
      token, 
      user: {
        id: userSession.id,
        name: userSession.name,
        role: userSession.role,
        email: userSession.email,
        authMethod: userSession.authMethod
      },
      message: 'Ingelogd in demo-modus'
    });
    return;
  }
  
  // If Microsoft SSO is configured but this is a regular login attempt
  if (process.env.AZURE_CLIENT_ID) {
    return res.status(400).json({ 
      error: 'Gebruik Microsoft SSO voor inloggen',
      requireSSO: true
    });
  }
  
  // Fallback for when no SSO is configured
  const user = demoUsers[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Ongeldige inloggegevens' });
  }
  const token = uuidv4();
  const userSession = { 
    id: username, 
    name: user.name, 
    role: user.role,
    email: user.email,
    authMethod: 'fallback'
  };
  sessions.set(token, userSession);
  res.json({ token, user: userSession });
});

app.get('/api/me', requireAuth, (req, res) => {
  // Update last activity
  req.user.lastActivity = Date.now();
  
  res.json({ 
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
      authMethod: req.user.authMethod
    }
  });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  
  // Log logout for security monitoring
  console.log(`User ${req.user.name} logged out from IP: ${req.ip}`);
  
  sessions.delete(token);
  res.status(204).end();
});

// Check SSO configuration status
app.get('/api/auth-config', (req, res) => {
  res.json({
    hasSSO: !!process.env.AZURE_CLIENT_ID,
    supportsDemoMode: true,
    demoUsers: Object.keys(demoUsers).map(key => ({
      username: key,
      name: demoUsers[key].name,
      role: demoUsers[key].role
    }))
  });
});

// AuditCase API Integration
const AUDITCASE_BASE_URL = process.env.AUDITCASE_API_URL || 'https://ac.klant.nl/ac/api';

// Middleware to validate API key
function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'X-API-KEY header vereist voor AuditCase integratie' });
  }
  req.auditCaseApiKey = apiKey;
  next();
}

// Get AuditCase client information
app.get('/api/auditcase/clients', requireAuth, validateApiKey, async (req, res) => {
  try {
    const response = await fetch(`${AUDITCASE_BASE_URL}/viewdata/clients`, {
      headers: {
        'X-API-KEY': req.auditCaseApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase API fout: ${response.status}`);
    }
    
    const clients = await response.json();
    res.json(clients);
  } catch (error) {
    console.error('AuditCase API fout:', error);
    res.status(500).json({ error: 'Fout bij ophalen clientgegevens van AuditCase' });
  }
});

// Get specific client profile
app.get('/api/auditcase/clients/:clientNumber', requireAuth, validateApiKey, async (req, res) => {
  try {
    const { clientNumber } = req.params;
    const response = await fetch(`${AUDITCASE_BASE_URL}/export/${clientNumber}/klantprofiel`, {
      headers: {
        'X-API-KEY': req.auditCaseApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase API fout: ${response.status}`);
    }
    
    const clientProfile = await response.json();
    res.json(clientProfile);
  } catch (error) {
    console.error('AuditCase API fout:', error);
    res.status(500).json({ error: 'Fout bij ophalen clientprofiel van AuditCase' });
  }
});

// Upload document to AuditCase
app.post('/api/auditcase/upload', requireAuth, validateApiKey, async (req, res) => {
  try {
    const formData = new FormData();
    
    // Forward the multipart form data to AuditCase
    const response = await fetch(`${AUDITCASE_BASE_URL}/api_upload`, {
      method: 'POST',
      headers: {
        'X-API-KEY': req.auditCaseApiKey
      },
      body: req.body
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase upload fout: ${response.status}`);
    }
    
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('AuditCase upload fout:', error);
    res.status(500).json({ error: 'Fout bij uploaden naar AuditCase' });
  }
});

// Create dossier item in AuditCase
app.post('/api/auditcase/dossier/:clientNumber/:configType', requireAuth, validateApiKey, async (req, res) => {
  try {
    const { clientNumber, configType } = req.params;
    const response = await fetch(`${AUDITCASE_BASE_URL}/document/dossier/create/${clientNumber}/${configType}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': req.auditCaseApiKey
      },
      body: req.body
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase dossier creatie fout: ${response.status}`);
    }
    
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('AuditCase dossier fout:', error);
    res.status(500).json({ error: 'Fout bij aanmaken dossier in AuditCase' });
  }
});

// Download shared files from AuditCase
app.get('/api/auditcase/files/:clientNumber', requireAuth, validateApiKey, async (req, res) => {
  try {
    const { clientNumber } = req.params;
    const response = await fetch(`${AUDITCASE_BASE_URL}/clientportaldocs/${clientNumber}`, {
      headers: {
        'X-API-KEY': req.auditCaseApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase bestand fout: ${response.status}`);
    }
    
    const files = await response.json();
    res.json(files);
  } catch (error) {
    console.error('AuditCase bestanden fout:', error);
    res.status(500).json({ error: 'Fout bij ophalen bestanden van AuditCase' });
  }
});

// Download specific file from AuditCase
app.get('/api/auditcase/files/:clientNumber/:fileId/:filename', requireAuth, validateApiKey, async (req, res) => {
  try {
    const { clientNumber, fileId, filename } = req.params;
    const response = await fetch(`${AUDITCASE_BASE_URL}/clientportaldoc/${clientNumber}/${fileId}/${encodeURIComponent(filename)}`, {
      headers: {
        'X-API-KEY': req.auditCaseApiKey
      }
    });
    
    if (!response.ok) {
      throw new Error(`AuditCase bestand download fout: ${response.status}`);
    }
    
    // Stream the file back to the client
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.body.pipe(res);
  } catch (error) {
    console.error('AuditCase bestand download fout:', error);
    res.status(500).json({ error: 'Fout bij downloaden bestand van AuditCase' });
  }
});

app.use(express.static('.'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
