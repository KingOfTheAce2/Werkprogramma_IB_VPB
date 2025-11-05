import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import passport from 'passport';
import { BearerStrategy } from 'passport-azure-ad';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import cors from 'cors';
import bcrypt from 'bcrypt';
import validator from 'validator';
import ExpressBrute from 'express-brute';
import ExpressBruteRedis from 'express-brute-redis';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import { body, validationResult } from 'express-validator';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss';
import csrf from 'csurf';
import { SecurityManager } from './src/security/SecurityManager.js';
import { SecurityLogger } from './src/security/SecurityLogger.js';

dotenv.config();

const app = express();
const securityManager = new SecurityManager();
const securityLogger = new SecurityLogger();

// Initialize Redis for session store and brute force protection
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(console.error);
}

// Maximum Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://alcdn.msauth.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://login.microsoftonline.com", "https://*.microsoftonline.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
    reportOnly: false
  },
  crossOriginEmbedderPolicy: { policy: "require-corp" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permissionsPolicy: {
    features: {
      camera: ["()"],
      microphone: ["()"],
      geolocation: ["()"],
      payment: ["()"],
      usb: ["()"],
      magnetometer: ["()"],
      accelerometer: ["()"],
      gyroscope: ["()"]
    }
  }
}));

// Additional Security Headers
app.use((req, res, next) => {
  const headers = securityManager.getSecurityHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});

// Advanced Rate Limiting & Attack Prevention
const createAdvancedLimiter = (options) => rateLimit({
  ...options,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityLogger.logSuspiciousActivity('RATE_LIMIT_EXCEEDED', 
      { id: req.user?.id, username: req.user?.username },
      { ip: req.ip, userAgent: req.get('User-Agent'), sessionId: req.sessionID },
      { 
        endpoint: req.path,
        method: req.method,
        riskLevel: 'medium',
        automaticActions: ['RATE_LIMITED']
      }
    );
    res.status(429).json({
      error: options.message,
      retryAfter: Math.ceil(options.windowMs / 1000)
    });
  }
});

// General API rate limiting
const apiLimiter = createAdvancedLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes  
  max: 200, // requests per windowMs per IP
  message: 'Te veel API verzoeken van dit IP-adres.',
});

// Authentication rate limiting with progressive delays
const authLimiter = createAdvancedLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // login attempts per windowMs per IP
  message: 'Te veel inlogpogingen. Account tijdelijk geblokkeerd.',
});

// Brute force protection with Redis backing
const bruteForceStore = redisClient ? new ExpressBruteRedis({
  client: redisClient,
  prefix: 'bf:'
}) : new ExpressBrute.MemoryStore();

const bruteForce = new ExpressBrute(bruteForceStore, {
  freeRetries: 3,
  minWait: 5 * 60 * 1000, // 5 minutes
  maxWait: 60 * 60 * 1000, // 1 hour  
  lifetime: 24 * 60 * 60, // 24 hours
  failCallback: (req, res, next, nextValidRequestDate) => {
    securityLogger.logSecurityIncident('BRUTE_FORCE_DETECTED', {
      severity: 'high',
      description: 'Brute force attack detected and blocked',
      userId: req.body?.username,
      nextValidRequest: nextValidRequestDate,
      requiresManualReview: true
    }, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    });

    res.status(429).json({
      error: 'Account tijdelijk geblokkeerd wegens te veel mislukte pogingen.',
      nextValidRequestDate: nextValidRequestDate
    });
  }
});

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per windowMs without delay
  delayMs: 500, // add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // max delay of 20 seconds
});

app.use(apiLimiter);
app.use(speedLimiter);

// Enhanced CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? (process.env.ALLOWED_ORIGINS?.split(',') || [])
      : ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://localhost:3000'];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      securityLogger.logSecurityIncident('CORS_VIOLATION', {
        severity: 'medium',
        description: 'Unauthorized origin attempted access',
        evidence: { origin, allowedOrigins }
      }, {
        ip: 'unknown',
        userAgent: 'unknown'
      });
      callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token']
}));

// Enhanced input sanitization and validation
app.use(express.json({ 
  limit: '5mb',
  strict: true,
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      securityLogger.logSuspiciousActivity('MALFORMED_JSON', null, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, { riskLevel: 'low' });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ 
  extended: false, // Prevent prototype pollution
  limit: '5mb',
  parameterLimit: 100
}));

// HTTP Parameter Pollution (HPP) protection
app.use(hpp({
  whitelist: ['sort', 'filter'] // Allow these parameters to be arrays
}));

// MongoDB injection protection (also works for general NoSQL injection)
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    securityLogger.logSuspiciousActivity('NOSQL_INJECTION_ATTEMPT', 
      { id: req.user?.id },
      { ip: req.ip, userAgent: req.get('User-Agent') },
      { 
        parameter: key,
        riskLevel: 'high',
        automaticActions: ['SANITIZED']
      }
    );
  }
}));

// Advanced input validation and sanitization middleware
function advancedInputValidation(req, res, next) {
  if (req.body) {
    const sanitizedBody = {};
    
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        // XSS protection
        let sanitized = xss(value, {
          whiteList: {}, // No HTML tags allowed by default
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script', 'style']
        });
        
        // Additional sanitization
        sanitized = validator.escape(sanitized.trim());
        
        // Length limits
        if (sanitized.length > 10000) {
          return res.status(400).json({ 
            error: 'Input too long',
            field: key
          });
        }
        
        sanitizedBody[key] = sanitized;
      } else if (typeof value === 'number') {
        // Number validation
        if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) {
          return res.status(400).json({
            error: 'Invalid number',
            field: key
          });
        }
        sanitizedBody[key] = value;
      } else if (typeof value === 'boolean') {
        sanitizedBody[key] = Boolean(value);
      } else if (Array.isArray(value)) {
        // Array validation (limit size)
        if (value.length > 100) {
          return res.status(400).json({
            error: 'Array too large',
            field: key
          });
        }
        sanitizedBody[key] = value.slice(0, 100); // Truncate if needed
      } else {
        // For objects, perform recursive validation
        sanitizedBody[key] = value;
      }
    }
    
    req.body = sanitizedBody;
  }
  next();
}

app.use(advancedInputValidation);

// Enhanced Session Management with Redis Store
const sessionStore = redisClient ? new RedisStore({
  client: redisClient,
  prefix: 'sess:',
  ttl: 4 * 60 * 60 // 4 hours TTL
}) : undefined;

app.use(session({
  secret: [
    process.env.SESSION_SECRET || securityManager.generateSecureSecret(),
    process.env.SESSION_SECRET_BACKUP || securityManager.generateSecureSecret()
  ], // Multiple secrets for key rotation
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiry on activity
  name: process.env.SESSION_NAME || `wpfsi_${securityManager.generateSecureToken(8)}`,
  genid: () => securityManager.generateSecureToken(32),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 4 * 60 * 60 * 1000, // 4 hours maximum security
    sameSite: 'strict',
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  // Custom session validation
  beforeSave: (session) => {
    // Encrypt sensitive session data
    if (session.user && session.user.sensitive) {
      session.user.sensitive = securityManager.encryptSensitiveData(session.user.sensitive);
    }
  }
}));

// CSRF Protection (only for non-API routes)
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  value: (req) => {
    return req.body._csrf || req.query._csrf || req.headers['x-csrf-token'];
  }
});

// Apply CSRF to form routes only
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next(); // Skip CSRF for API routes (using JWT instead)
  }
  csrfProtection(req, res, next);
});

// Enhanced Authentication Middleware with Security Analysis
function requireAuth(req, res, next) {
  const startTime = Date.now();
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      securityLogger.logSuspiciousActivity('MISSING_AUTH_TOKEN', null, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      }, { endpoint: req.path, riskLevel: 'low' });
      
      return res.status(401).json({ 
        error: 'Authenticatie vereist',
        code: 'AUTH_TOKEN_MISSING' 
      });
    }
    
    const token = authHeader.substring(7);
    
    // Validate JWT token
    let decoded;
    try {
      decoded = securityManager.verifyToken(token, 'access');
    } catch (error) {
      securityLogger.logSuspiciousActivity('INVALID_JWT_TOKEN', null, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      }, { 
        error: error.message,
        endpoint: req.path,
        riskLevel: 'medium'
      });
      
      return res.status(401).json({ 
        error: 'Ongeldige authenticatie token',
        code: 'AUTH_TOKEN_INVALID'
      });
    }
    
    // Check if user exists in session store
    const userSession = sessions.get(decoded.uid);
    if (!userSession) {
      return res.status(401).json({ 
        error: 'Sessie niet gevonden',
        code: 'SESSION_NOT_FOUND'
      });
    }
    
    // Enhanced session validation
    const now = Date.now();
    const sessionAge = now - userSession.createdAt;
    const lastActivity = now - userSession.lastActivity;
    
    // Check session timeout (4 hours for maximum security)
    if (sessionAge > 4 * 60 * 60 * 1000) {
      sessions.delete(decoded.uid);
      securityLogger.logSecurityIncident('SESSION_EXPIRED', {
        severity: 'low',
        description: 'User session expired due to age',
        userId: decoded.uid
      }, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });
      
      return res.status(401).json({ 
        error: 'Sessie verlopen, log opnieuw in',
        code: 'SESSION_EXPIRED'
      });
    }
    
    // Check inactivity timeout (1 hour)
    if (lastActivity > 60 * 60 * 1000) {
      sessions.delete(decoded.uid);
      return res.status(401).json({ 
        error: 'Sessie verlopen door inactiviteit',
        code: 'SESSION_INACTIVE'
      });
    }
    
    // Device fingerprint validation
    const currentFingerprint = securityManager.createDeviceFingerprint({
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      acceptLanguage: req.get('Accept-Language'),
      acceptEncoding: req.get('Accept-Encoding')
    });
    
    if (decoded.device && decoded.device !== currentFingerprint) {
      securityLogger.logSecurityIncident('DEVICE_FINGERPRINT_MISMATCH', {
        severity: 'high',
        description: 'Device fingerprint changed mid-session',
        userId: decoded.uid,
        evidence: {
          expectedFingerprint: decoded.device,
          actualFingerprint: currentFingerprint
        },
        requiresManualReview: true
      }, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });
      
      // Force re-authentication for security
      sessions.delete(decoded.uid);
      return res.status(401).json({ 
        error: 'Beveiligingscheck mislukt, log opnieuw in',
        code: 'SECURITY_CHECK_FAILED'
      });
    }
    
    // Security analysis of the request
    const securityAnalysis = securityManager.analyzeSecurityEvent({
      type: 'api_access',
      userId: decoded.uid,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: {
        endpoint: req.path,
        method: req.method,
        previousLocations: userSession.locations || []
      }
    });
    
    // Handle high-risk requests
    if (securityAnalysis.riskLevel === 'high' && !securityAnalysis.allowAction) {
      securityLogger.logSecurityIncident('HIGH_RISK_ACCESS_BLOCKED', {
        severity: 'high',
        description: 'High-risk access attempt blocked',
        userId: decoded.uid,
        evidence: securityAnalysis
      }, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });
      
      return res.status(403).json({ 
        error: 'Toegang geweigerd - beveiligingsanalyse',
        code: 'HIGH_RISK_BLOCKED',
        recommendations: securityAnalysis.recommendations
      });
    }
    
    // Update session activity
    userSession.lastActivity = now;
    userSession.requestCount = (userSession.requestCount || 0) + 1;
    
    // Store location info for future analysis
    if (securityAnalysis.location) {
      userSession.locations = userSession.locations || [];
      userSession.locations.unshift(securityAnalysis.location);
      userSession.locations = userSession.locations.slice(0, 5); // Keep last 5 locations
    }
    
    req.user = userSession;
    req.securityAnalysis = securityAnalysis;
    
    // Log API access for audit trail
    const responseTime = Date.now() - startTime;
    securityLogger.logAPICall(req.method, req.path, userSession, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    }, {
      statusCode: 200, // Will be updated by response middleware if needed
      responseTime: responseTime
    });
    
    next();
    
  } catch (error) {
    securityLogger.logSecurityIncident('AUTHENTICATION_ERROR', {
      severity: 'medium',
      description: 'Authentication middleware error',
      evidence: { error: error.message }
    }, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    });
    
    return res.status(500).json({ 
      error: 'Authenticatie fout',
      code: 'AUTH_ERROR'
    });
  }
}

// Enhanced Role-based Access Control
function requireRole(allowedRoles, additionalChecks = {}) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authenticatie vereist',
        code: 'AUTH_REQUIRED'
      });
    }
    
    // Basic role check
    if (!allowedRoles.includes(req.user.role)) {
      securityLogger.logSuspiciousActivity('UNAUTHORIZED_ROLE_ACCESS', req.user, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      }, {
        requiredRoles: allowedRoles,
        userRole: req.user.role,
        endpoint: req.path,
        riskLevel: 'medium'
      });
      
      return res.status(403).json({ 
        error: 'Onvoldoende rechten voor deze actie',
        code: 'INSUFFICIENT_PRIVILEGES'
      });
    }
    
    // Additional security checks
    if (additionalChecks.requireMFA && !req.user.mfaVerified) {
      return res.status(403).json({
        error: 'Multi-factor authenticatie vereist',
        code: 'MFA_REQUIRED'
      });
    }
    
    if (additionalChecks.maxRequestsPerHour) {
      const hourlyRequests = req.user.hourlyRequestCount || 0;
      if (hourlyRequests > additionalChecks.maxRequestsPerHour) {
        return res.status(429).json({
          error: 'Te veel verzoeken per uur',
          code: 'HOURLY_LIMIT_EXCEEDED'
        });
      }
    }
    
    // Time-based access control
    if (additionalChecks.businessHoursOnly) {
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) {
        securityLogger.logSuspiciousActivity('AFTER_HOURS_ACCESS', req.user, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        }, {
          hour: hour,
          endpoint: req.path,
          riskLevel: 'medium'
        });
        
        return res.status(403).json({
          error: 'Toegang alleen tijdens kantooruren (06:00-22:00)',
          code: 'BUSINESS_HOURS_ONLY'
        });
      }
    }
    
    next();
  };
}

// IP whitelist middleware for sensitive operations
function requireWhitelistedIP(req, res, next) {
  const whitelistedIPs = process.env.WHITELISTED_IPS?.split(',') || [];
  
  if (whitelistedIPs.length > 0 && !whitelistedIPs.includes(req.ip)) {
    securityLogger.logSecurityIncident('IP_NOT_WHITELISTED', {
      severity: 'high',
      description: 'Non-whitelisted IP attempted sensitive operation',
      evidence: { 
        ip: req.ip, 
        whitelistedIPs: whitelistedIPs.map(ip => ip.substring(0, ip.lastIndexOf('.')) + '.*') 
      }
    }, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    });
    
    return res.status(403).json({
      error: 'IP adres niet toegestaan voor deze operatie',
      code: 'IP_NOT_WHITELISTED'
    });
  }
  
  next();
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

// Enhanced Login endpoint with maximum security
app.post('/api/login', authLimiter, async (req, res) => {
  const startTime = Date.now();
  const requestInfo = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    sessionId: req.sessionID,
    location: null // Will be populated by security analysis
  };

  try {
    const { username, password, useDemo, screenResolution, timezone } = req.body;
    
    // Enhanced input validation
    const validationResult = securityManager.validateAndSanitize(
      { username, password },
      {
        username: { 
          type: 'alphanumeric', 
          minLength: 2, 
          maxLength: 50,
          pattern: /^[a-zA-Z0-9_.-]+$/
        },
        password: { 
          minLength: 1,
          maxLength: 128
        }
      }
    );

    if (!validationResult.isValid) {
      securityLogger.logSecurityIncident('INVALID_LOGIN_INPUT', {
        severity: 'low',
        description: 'Invalid input format in login attempt',
        evidence: { errors: validationResult.errors }
      }, requestInfo);
      
      return res.status(400).json({ 
        error: 'Ongeldige invoer formaat',
        details: validationResult.errors
      });
    }

    const sanitizedUsername = validationResult.sanitized.username;
    const sanitizedPassword = validationResult.sanitized.password;

    // Security event analysis
    const securityEvent = {
      type: 'login_attempt',
      userId: null,
      ip: requestInfo.ip,
      userAgent: requestInfo.userAgent,
      timestamp: new Date(),
      metadata: { attempts: 1, useDemo: useDemo || false }
    };

    const riskAnalysis = securityManager.analyzeSecurityEvent(securityEvent);

    // Block if high risk detected
    if (!riskAnalysis.allowAction) {
      securityLogger.logSuspiciousActivity('HIGH_RISK_LOGIN_BLOCKED', null, requestInfo, {
        riskLevel: riskAnalysis.riskLevel,
        indicators: riskAnalysis.flags,
        automaticActions: ['LOGIN_BLOCKED']
      });

      return res.status(403).json({ 
        error: 'Login geblokkeerd vanwege verdachte activiteit',
        retryAfter: 900 // 15 minutes
      });
    }

    // Check if this is a demo login request
    if (useDemo === true || !process.env.AZURE_CLIENT_ID) {
      const user = demoUsers[sanitizedUsername];
      const loginResult = { success: false, error: null };

      if (!user) {
        loginResult.error = 'USER_NOT_FOUND';
      } else {
        // Simple password check for demo (in production, use hashed passwords)
        if (user.password !== sanitizedPassword) {
          loginResult.error = 'INVALID_PASSWORD';
        } else {
          loginResult.success = true;
        }
      }

      // Log the login attempt
      securityLogger.logLoginAttempt(
        loginResult,
        {
          id: user?.id || sanitizedUsername,
          username: sanitizedUsername,
          email: user?.email || null,
          authMethod: 'demo_fallback',
          mfaUsed: false
        },
        {
          ...requestInfo,
          riskAssessment: riskAnalysis
        }
      );

      if (!loginResult.success) {
        // Add artificial delay to prevent timing attacks
        const delay = Math.random() * 1000 + 500; // 500-1500ms
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return res.status(401).json({ 
          error: 'Ongeldige inloggegevens'
        });
      }

      // Generate enhanced JWT tokens with device fingerprinting
      const deviceInfo = {
        userAgent: requestInfo.userAgent,
        ip: requestInfo.ip,
        acceptLanguage: req.get('Accept-Language') || '',
        acceptEncoding: req.get('Accept-Encoding') || '',
        screenResolution: screenResolution || '',
        timezone: timezone || ''
      };

      const tokens = securityManager.generateTokens(user, deviceInfo);
      
      // Store session with enhanced security context
      const userSession = {
        id: user.id || sanitizedUsername,
        name: user.name,
        role: user.role,
        email: user.email,
        authMethod: 'demo_fallback',
        deviceFingerprint: securityManager.createDeviceFingerprint(deviceInfo),
        loginTime: Date.now(),
        lastActivity: Date.now(),
        riskLevel: riskAnalysis.riskLevel,
        mfaRequired: user.mfaEnabled || false,
        sessionTimeout: Date.now() + securityManager.sessionTimeout,
        ip: requestInfo.ip
      };

      sessions.set(tokens.accessToken, userSession);

      // Log successful authentication
      securityLogger.logSystemEvent('SUCCESSFUL_LOGIN', {
        userId: userSession.id,
        username: sanitizedUsername,
        role: user.role,
        ip: requestInfo.ip,
        responseTime: Date.now() - startTime,
        riskLevel: riskAnalysis.riskLevel
      });

      res.json({
        ...tokens,
        user: {
          id: userSession.id,
          name: userSession.name,
          role: userSession.role,
          email: userSession.email,
          authMethod: userSession.authMethod,
          mfaRequired: userSession.mfaRequired
        },
        security: {
          riskLevel: riskAnalysis.riskLevel,
          sessionTimeout: securityManager.sessionTimeout / 1000 // in seconds
        },
        message: 'Ingelogd in demo-modus'
      });
      return;
    }
    
    // If Microsoft SSO is configured but this is a regular login attempt
    if (process.env.AZURE_CLIENT_ID) {
      securityLogger.logSecurityIncident('SSO_BYPASS_ATTEMPT', {
        severity: 'medium',
        description: 'Attempt to bypass SSO authentication',
        evidence: { username: sanitizedUsername }
      }, requestInfo);

      return res.status(400).json({ 
        error: 'Gebruik Microsoft SSO voor inloggen',
        requireSSO: true
      });
    }
    
    // This code path should not be reached with the new security implementation
    throw new Error('Unexpected authentication path');

  } catch (error) {
    securityLogger.logSecurityIncident('LOGIN_SYSTEM_ERROR', {
      severity: 'high',
      description: 'System error during login process',
      evidence: { error: error.message }
    }, requestInfo);

    console.error('Login system error:', error);
    res.status(500).json({ 
      error: 'Systeemfout tijdens inloggen. Probeer opnieuw.'
    });
  }
});

// Enhanced user profile endpoint with security logging
app.get('/api/me', requireAuth, (req, res) => {
  // Update last activity
  req.user.lastActivity = Date.now();
  
  // Log user profile access for audit trail
  securityLogger.logDataAccess(
    {
      id: req.user.id,
      username: req.user.name,
      role: req.user.role
    },
    {
      type: 'USER_PROFILE',
      resourceId: req.user.id,
      action: 'read',
      sensitive: false
    },
    {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionID
    }
  );
  
  res.json({ 
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      email: req.user.email,
      authMethod: req.user.authMethod,
      lastActivity: req.user.lastActivity,
      sessionTimeout: req.user.sessionTimeout,
      riskLevel: req.user.riskLevel || 'low'
    }
  });
});

// Enhanced logout endpoint with security logging
app.post('/api/logout', requireAuth, (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  
  // Calculate session duration
  const sessionDuration = Date.now() - (req.user.loginTime || Date.now());
  
  // Log logout for security monitoring and audit trail
  securityLogger.logLogout(
    {
      id: req.user.id,
      username: req.user.name
    },
    {
      sessionId: req.sessionID,
      sessionDuration: sessionDuration,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      logoutType: 'user_initiated'
    }
  );
  
  // Clear session
  sessions.delete(token);
  
  // Log system event
  securityLogger.logSystemEvent('USER_LOGOUT', {
    userId: req.user.id,
    username: req.user.name,
    sessionDuration: sessionDuration,
    ip: req.ip
  });
  
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

// AuditCase API key from environment
const AUDITCASE_API_KEY = process.env.AUDITCASE_API_KEY;

// Middleware to validate AuditCase configuration
function validateAuditCaseConfig(req, res, next) {
  if (!AUDITCASE_API_KEY) {
    return res.status(500).json({ error: 'AuditCase integratie niet geconfigureerd op server' });
  }
  req.auditCaseApiKey = AUDITCASE_API_KEY;
  next();
}

// Get AuditCase client information
app.get('/api/auditcase/clients', requireAuth, validateAuditCaseConfig, async (req, res) => {
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
app.get('/api/auditcase/clients/:clientNumber', requireAuth, validateAuditCaseConfig, async (req, res) => {
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
app.post('/api/auditcase/upload', requireAuth, validateAuditCaseConfig, async (req, res) => {
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
app.post('/api/auditcase/dossier/:clientNumber/:configType', requireAuth, validateAuditCaseConfig, async (req, res) => {
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
app.get('/api/auditcase/files/:clientNumber', requireAuth, validateAuditCaseConfig, async (req, res) => {
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
app.get('/api/auditcase/files/:clientNumber/:fileId/:filename', requireAuth, validateAuditCaseConfig, async (req, res) => {
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

// Enhanced Document Management Endpoints

// Create year structure in AuditCase
app.post('/api/documents/:clientNumber/years/:fiscalYear/structure', requireAuth, validateAuditCaseConfig, async (req, res) => {
  try {
    const { clientNumber, fiscalYear } = req.params;
    const baseFolder = `Werkprogramma_${clientNumber}_${fiscalYear}`;
    
    const folders = [
      `${baseFolder}/01_Permanente_Documenten`,
      `${baseFolder}/02_Jaarlijkse_Documenten`, 
      `${baseFolder}/03_Werkprogramma_Vragen`,
      `${baseFolder}/04_Analyses_Rapportages`,
      `${baseFolder}/05_Correspondentie`,
      `${baseFolder}/06_Archief`,
      `${baseFolder}/99_Temp_Upload`
    ];

    const results = [];
    for (const folder of folders) {
      try {
        const response = await fetch(`${AUDITCASE_BASE_URL}/document/dossier/create/${clientNumber}/folder`, {
          method: 'POST',
          headers: {
            'X-API-KEY': req.auditCaseApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            folderPath: folder,
            description: `Werkprogramma structuur ${fiscalYear}`
          })
        });
        
        results.push({ 
          folder, 
          success: response.ok,
          status: response.status 
        });
      } catch (error) {
        results.push({ 
          folder, 
          success: false, 
          error: error.message 
        });
      }
    }

    res.json({ 
      clientNumber, 
      fiscalYear, 
      baseFolder,
      folders: results 
    });
  } catch (error) {
    console.error('Structure creation error:', error);
    res.status(500).json({ error: 'Fout bij aanmaken mappenstructuur' });
  }
});

// Upload document with categorization
app.post('/api/documents/:clientNumber/upload', requireAuth, validateAuditCaseConfig, async (req, res) => {
  try {
    const { clientNumber } = req.params;
    const { documentType, fiscalYear, questionId, category } = req.body;
    
    // Determine folder based on category
    const baseFolder = `Werkprogramma_${clientNumber}_${fiscalYear}`;
    let targetFolder;
    
    switch (category) {
      case 'permanent':
        targetFolder = `${baseFolder}/01_Permanente_Documenten`;
        break;
      case 'annual':
        targetFolder = `${baseFolder}/02_Jaarlijkse_Documenten`;
        break;
      case 'conditional':
        targetFolder = `${baseFolder}/04_Analyses_Rapportages`;
        break;
      case 'historical':
        targetFolder = `${baseFolder}/06_Archief`;
        break;
      default:
        targetFolder = `${baseFolder}/99_Temp_Upload`;
    }

    // Forward upload to AuditCase with folder structure
    const formData = new FormData();
    if (req.file) {
      formData.append('file', req.file.buffer, req.file.originalname);
    }
    formData.append('folderPath', targetFolder);
    formData.append('documentType', documentType);
    formData.append('category', category);
    if (questionId) formData.append('questionId', questionId);

    const response = await fetch(`${AUDITCASE_BASE_URL}/document/dossier/create/${clientNumber}/upload`, {
      method: 'POST',
      headers: {
        'X-API-KEY': req.auditCaseApiKey
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`AuditCase upload fout: ${response.status}`);
    }

    const result = await response.json();
    
    // Log upload for audit trail
    console.log(`Document uploaded: ${req.file?.originalname} to ${targetFolder} by user ${req.user.name}`);

    res.json({
      ...result,
      folderPath: targetFolder,
      category: category,
      documentType: documentType
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ error: 'Fout bij uploaden document' });
  }
});

// Get documents for rollover planning
app.get('/api/documents/:clientNumber/years/:fiscalYear/rollover', requireAuth, validateAuditCaseConfig, async (req, res) => {
  try {
    const { clientNumber, fiscalYear } = req.params;
    const { targetYear } = req.query;
    
    // Get all documents from the fiscal year
    const response = await fetch(`${AUDITCASE_BASE_URL}/clientportaldocs/${clientNumber}`, {
      headers: {
        'X-API-KEY': req.auditCaseApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get documents: ${response.status}`);
    }

    const allDocs = await response.json();
    
    // Filter documents for the specific year and categorize
    const yearDocs = allDocs.filter(doc => 
      doc.Level2 === fiscalYear || doc.Description?.includes(fiscalYear)
    );

    const categorizedDocs = yearDocs.map(doc => {
      const category = determineDocumentCategory(doc);
      return {
        ...doc,
        category,
        rolloverAction: determineRolloverAction(category),
        currentPath: `${doc.Level1}/${doc.Level2}/${doc.Level3}/${doc.Level4}`,
        targetPath: `Werkprogramma_${clientNumber}_${targetYear}/${getCategoryFolder(category)}/${doc.FileName}`
      };
    });

    res.json({
      fiscalYear,
      targetYear,
      totalDocuments: categorizedDocs.length,
      documents: categorizedDocs,
      summary: {
        permanent: categorizedDocs.filter(d => d.category === 'permanent').length,
        annual: categorizedDocs.filter(d => d.category === 'annual').length,
        conditional: categorizedDocs.filter(d => d.category === 'conditional').length,
        historical: categorizedDocs.filter(d => d.category === 'historical').length
      }
    });
  } catch (error) {
    console.error('Rollover planning error:', error);
    res.status(500).json({ error: 'Fout bij rollover planning' });
  }
});

// Execute document rollover
app.post('/api/documents/:clientNumber/years/:fromYear/rollover/:toYear', requireAuth, requireRole(['reviewer', 'admin']), validateAuditCaseConfig, async (req, res) => {
  try {
    const { clientNumber, fromYear, toYear } = req.params;
    const { selections } = req.body; // Array of { documentId, action, newFile? }
    
    const results = {
      copied: [],
      replaced: [],
      archived: [],
      errors: [],
      summary: {}
    };

    // First create the new year structure
    const structureResponse = await fetch(`${req.protocol}://${req.get('host')}/api/documents/${clientNumber}/years/${toYear}/structure`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.authorization
      }
    });

    if (!structureResponse.ok) {
      throw new Error('Failed to create year structure');
    }

    // Process each selection
    for (const selection of selections) {
      try {
        switch (selection.action) {
          case 'copy':
            await copyDocumentToNewYear(req.auditCaseApiKey, clientNumber, selection.document, fromYear, toYear);
            results.copied.push(selection.document.FileName);
            break;
            
          case 'replace':
            if (selection.newFile) {
              await replaceDocumentWithNew(req.auditCaseApiKey, clientNumber, selection.document, selection.newFile, toYear);
              results.replaced.push(selection.document.FileName);
            }
            break;
            
          case 'archive':
            await archiveDocument(req.auditCaseApiKey, clientNumber, selection.document, fromYear);
            results.archived.push(selection.document.FileName);
            break;
        }
      } catch (error) {
        results.errors.push({
          document: selection.document.FileName,
          action: selection.action,
          error: error.message
        });
      }
    }

    // Log the rollover for audit trail
    console.log(`Document rollover executed: ${fromYear} → ${toYear} for client ${clientNumber} by user ${req.user.name}`);

    results.summary = {
      totalProcessed: selections.length,
      successful: results.copied.length + results.replaced.length + results.archived.length,
      failed: results.errors.length
    };

    res.json(results);
  } catch (error) {
    console.error('Rollover execution error:', error);
    res.status(500).json({ error: 'Fout bij uitvoeren rollover' });
  }
});

// Helper functions for document management
function determineDocumentCategory(doc) {
  const fileName = doc.FileName?.toLowerCase() || '';
  const description = doc.Description?.toLowerCase() || '';
  
  // Permanent documents
  if (fileName.includes('statuten') || fileName.includes('articles') || 
      fileName.includes('vergunning') || fileName.includes('license') ||
      description.includes('permanent') || description.includes('doorlopend')) {
    return 'permanent';
  }
  
  // Annual documents  
  if (fileName.includes('jaarrekening') || fileName.includes('annual') ||
      fileName.includes('aangifte') || fileName.includes('tax') ||
      fileName.includes('controle') || fileName.includes('audit')) {
    return 'annual';
  }
  
  // Historical documents
  if (fileName.includes('archief') || fileName.includes('archive') ||
      description.includes('oud') || description.includes('previous')) {
    return 'historical';
  }
  
  // Default to conditional
  return 'conditional';
}

function determineRolloverAction(category) {
  switch (category) {
    case 'permanent': return 'auto_copy';
    case 'annual': return 'replace_required';
    case 'conditional': return 'user_decision';
    case 'historical': return 'archive_only';
    default: return 'user_decision';
  }
}

function getCategoryFolder(category) {
  switch (category) {
    case 'permanent': return '01_Permanente_Documenten';
    case 'annual': return '02_Jaarlijkse_Documenten';
    case 'conditional': return '04_Analyses_Rapportages';
    case 'historical': return '06_Archief';
    default: return '99_Temp_Upload';
  }
}

async function copyDocumentToNewYear(apiKey, clientNumber, document, fromYear, toYear) {
  // Implementation would use AuditCase API to copy document
  // This is a placeholder for the actual AuditCase copy operation
  console.log(`Copying ${document.FileName} from ${fromYear} to ${toYear}`);
}

async function replaceDocumentWithNew(apiKey, clientNumber, oldDocument, newFile, toYear) {
  // Implementation would upload new file and mark old as replaced
  console.log(`Replacing ${oldDocument.FileName} with new file for ${toYear}`);
}

async function archiveDocument(apiKey, clientNumber, document, fiscalYear) {
  // Implementation would move document to archive folder
  console.log(`Archiving ${document.FileName} from ${fiscalYear}`);
}

app.use(express.static('.'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
