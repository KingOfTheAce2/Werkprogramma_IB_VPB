// Maximum Security Implementation for Werkprogramma Application

import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import forge from 'node-forge';
import validator from 'validator';
import xss from 'xss';
import geoip from 'geoip-lite';
import UAParser from 'ua-parser-js';
import ip from 'ip';

export class SecurityManager {
  constructor() {
    this.encryptionKey = this.deriveEncryptionKey();
    this.suspiciousActivityThreshold = 5;
    this.maxLoginAttempts = 3;
    this.lockoutDuration = 30 * 60 * 1000; // 30 minutes
    this.sessionTimeout = 4 * 60 * 60 * 1000; // 4 hours for high security
    this.jwtSecrets = {
      access: process.env.JWT_ACCESS_SECRET || this.generateSecureSecret(),
      refresh: process.env.JWT_REFRESH_SECRET || this.generateSecureSecret(),
      mfa: process.env.JWT_MFA_SECRET || this.generateSecureSecret()
    };
  }

  // Advanced Encryption & Key Management
  deriveEncryptionKey() {
    const secret = process.env.MASTER_ENCRYPTION_KEY || 'fallback-key-change-in-production';
    return crypto.pbkdf2Sync(secret, 'werkprogramma-salt', 100000, 32, 'sha512');
  }

  generateSecureSecret(length = 64) {
    return crypto.randomBytes(length).toString('base64url');
  }

  // Data Encryption/Decryption with AES-256-GCM
  encryptSensitiveData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(Buffer.from('werkprogramma-auth-data'));
      
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm'
      };
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  decryptSensitiveData(encryptedData) {
    try {
      const { encrypted, iv, authTag } = encryptedData;
      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(Buffer.from('werkprogramma-auth-data'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Decryption failed or data tampered');
    }
  }

  // Advanced Password Security with Argon2
  async hashPassword(password, options = {}) {
    const config = {
      type: argon2.argon2id,
      memoryCost: options.memoryCost || 65536, // 64 MB
      timeCost: options.timeCost || 3,
      parallelism: options.parallelism || 4,
      ...options
    };

    try {
      return await argon2.hash(password, config);
    } catch (error) {
      throw new Error('Password hashing failed');
    }
  }

  async verifyPassword(password, hash) {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      return false;
    }
  }

  // Multi-Factor Authentication (TOTP)
  generateMFASecret(userIdentifier) {
    return speakeasy.generateSecret({
      name: `Werkprogramma (${userIdentifier})`,
      issuer: 'Werkprogramma Fiscale Aangiftes',
      length: 32
    });
  }

  verifyMFAToken(token, secret) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1 // Allow 1 step tolerance
    });
  }

  // Advanced JWT with Multiple Token Types
  generateTokens(user, deviceInfo = {}) {
    const now = Math.floor(Date.now() / 1000);
    const deviceFingerprint = this.createDeviceFingerprint(deviceInfo);
    
    const payload = {
      uid: user.id,
      role: user.role,
      email: user.email,
      mfa: user.mfaEnabled || false,
      device: deviceFingerprint,
      iat: now
    };

    const accessToken = jwt.sign(
      { ...payload, type: 'access', exp: now + (15 * 60) }, // 15 minutes
      this.jwtSecrets.access,
      { algorithm: 'HS512' }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh', exp: now + (7 * 24 * 60 * 60) }, // 7 days
      this.jwtSecrets.refresh,
      { algorithm: 'HS512' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      tokenType: 'Bearer'
    };
  }

  verifyToken(token, type = 'access') {
    try {
      const secret = this.jwtSecrets[type];
      const decoded = jwt.verify(token, secret, { algorithms: ['HS512'] });
      
      if (decoded.type !== type) {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Device Fingerprinting for Enhanced Security
  createDeviceFingerprint(deviceInfo) {
    const {
      userAgent = '',
      ip = '',
      acceptLanguage = '',
      acceptEncoding = '',
      screenResolution = '',
      timezone = ''
    } = deviceInfo;

    const fingerprint = [
      userAgent,
      ip.substring(0, ip.lastIndexOf('.')), // Partial IP for privacy
      acceptLanguage,
      acceptEncoding,
      screenResolution,
      timezone
    ].join('|');

    return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
  }

  // Advanced Input Validation & Sanitization
  validateAndSanitize(input, rules = {}) {
    const result = {
      isValid: true,
      sanitized: {},
      errors: []
    };

    for (const [field, value] of Object.entries(input)) {
      const rule = rules[field] || {};
      
      try {
        // Basic sanitization
        let sanitized = typeof value === 'string' ? validator.escape(value.trim()) : value;
        
        // XSS protection
        if (rule.allowHtml) {
          sanitized = xss(sanitized, {
            whiteList: rule.allowedTags || {},
            stripIgnoreTag: true,
            stripIgnoreTagBody: ['script']
          });
        }

        // Type validation
        if (rule.type) {
          switch (rule.type) {
            case 'email':
              if (!validator.isEmail(sanitized)) {
                result.errors.push(`${field} must be a valid email`);
                result.isValid = false;
              }
              break;
            case 'uuid':
              if (!validator.isUUID(sanitized)) {
                result.errors.push(`${field} must be a valid UUID`);
                result.isValid = false;
              }
              break;
            case 'alphanumeric':
              if (!validator.isAlphanumeric(sanitized)) {
                result.errors.push(`${field} must be alphanumeric`);
                result.isValid = false;
              }
              break;
            case 'numeric':
              if (!validator.isNumeric(sanitized)) {
                result.errors.push(`${field} must be numeric`);
                result.isValid = false;
              }
              break;
          }
        }

        // Length validation
        if (rule.minLength && sanitized.length < rule.minLength) {
          result.errors.push(`${field} must be at least ${rule.minLength} characters`);
          result.isValid = false;
        }
        if (rule.maxLength && sanitized.length > rule.maxLength) {
          result.errors.push(`${field} must be no more than ${rule.maxLength} characters`);
          result.isValid = false;
        }

        // Pattern validation
        if (rule.pattern && !rule.pattern.test(sanitized)) {
          result.errors.push(`${field} format is invalid`);
          result.isValid = false;
        }

        result.sanitized[field] = sanitized;
      } catch (error) {
        result.errors.push(`${field} validation error: ${error.message}`);
        result.isValid = false;
      }
    }

    return result;
  }

  // Security Event Analysis
  analyzeSecurityEvent(event) {
    const {
      type,
      userId,
      ip: clientIP,
      userAgent,
      timestamp = new Date(),
      metadata = {}
    } = event;

    const analysis = {
      riskLevel: 'low',
      flags: [],
      recommendations: [],
      allowAction: true
    };

    // Geographic analysis
    try {
      const geo = geoip.lookup(clientIP);
      if (geo) {
        analysis.location = {
          country: geo.country,
          region: geo.region,
          city: geo.city,
          timezone: geo.timezone
        };

        // Check for unusual geographic locations
        if (metadata.previousLocations && metadata.previousLocations.length > 0) {
          const lastLocation = metadata.previousLocations[0];
          if (lastLocation.country !== geo.country) {
            analysis.flags.push('geographic_anomaly');
            analysis.riskLevel = 'medium';
          }
        }
      }
    } catch (error) {
      console.warn('GeoIP lookup failed:', error.message);
    }

    // User Agent analysis
    try {
      const parser = new UAParser(userAgent);
      const device = parser.getResult();
      
      analysis.device = {
        browser: device.browser.name,
        os: device.os.name,
        deviceType: device.device.type || 'desktop'
      };

      // Check for suspicious user agents
      if (!device.browser.name || device.browser.name === 'unknown') {
        analysis.flags.push('suspicious_user_agent');
        analysis.riskLevel = 'medium';
      }
    } catch (error) {
      console.warn('User Agent parsing failed:', error.message);
    }

    // IP analysis
    if (ip.isPrivate(clientIP)) {
      analysis.flags.push('private_ip');
    }

    // Time-based analysis
    const hour = timestamp.getHours();
    if (hour < 6 || hour > 22) { // Outside business hours
      analysis.flags.push('unusual_time');
    }

    // Event-specific analysis
    switch (type) {
      case 'login_attempt':
        if (metadata.attempts > this.maxLoginAttempts) {
          analysis.flags.push('brute_force_attempt');
          analysis.riskLevel = 'high';
          analysis.allowAction = false;
        }
        break;

      case 'password_change':
        analysis.riskLevel = 'medium';
        analysis.recommendations.push('verify_via_secondary_channel');
        break;

      case 'sensitive_data_access':
        if (analysis.flags.length > 0) {
          analysis.riskLevel = 'high';
          analysis.recommendations.push('require_additional_verification');
        }
        break;
    }

    // Overall risk assessment
    if (analysis.flags.length >= 3) {
      analysis.riskLevel = 'high';
      analysis.allowAction = false;
      analysis.recommendations.push('block_and_notify_admin');
    } else if (analysis.flags.length >= 2) {
      analysis.riskLevel = 'medium';
      analysis.recommendations.push('require_mfa');
    }

    return analysis;
  }

  // Secure Random Token Generation
  generateSecureToken(length = 32, encoding = 'hex') {
    return crypto.randomBytes(length).toString(encoding);
  }

  // CSRF Token Management
  generateCSRFToken(sessionId) {
    const timestamp = Date.now();
    const data = `${sessionId}:${timestamp}`;
    const hmac = crypto.createHmac('sha256', this.jwtSecrets.access);
    hmac.update(data);
    const signature = hmac.digest('hex');
    
    return `${timestamp}.${signature}`;
  }

  verifyCSRFToken(token, sessionId, maxAge = 3600000) { // 1 hour default
    try {
      const [timestamp, signature] = token.split('.');
      const now = Date.now();
      
      if (now - parseInt(timestamp) > maxAge) {
        return false;
      }

      const data = `${sessionId}:${timestamp}`;
      const hmac = crypto.createHmac('sha256', this.jwtSecrets.access);
      hmac.update(data);
      const expectedSignature = hmac.digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  // Security Headers Configuration
  getSecurityHeaders() {
    return {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': this.generateCSP(),
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin'
    };
  }

  generateCSP() {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://alcdn.msauth.net",
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self' https://login.microsoftonline.com https://*.microsoftonline.com",
      "frame-src 'none'",
      "object-src 'none'",
      "media-src 'self'",
      "worker-src 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ');
  }

  // Password Strength Validation
  validatePasswordStrength(password) {
    const analysis = {
      score: 0,
      feedback: [],
      isStrong: false
    };

    // Length check
    if (password.length >= 12) analysis.score += 2;
    else if (password.length >= 8) analysis.score += 1;
    else analysis.feedback.push('Password should be at least 12 characters');

    // Character variety
    if (/[a-z]/.test(password)) analysis.score += 1;
    else analysis.feedback.push('Add lowercase letters');

    if (/[A-Z]/.test(password)) analysis.score += 1;
    else analysis.feedback.push('Add uppercase letters');

    if (/[0-9]/.test(password)) analysis.score += 1;
    else analysis.feedback.push('Add numbers');

    if (/[^a-zA-Z0-9]/.test(password)) analysis.score += 2;
    else analysis.feedback.push('Add special characters');

    // Common patterns check
    if (/(.)\1{2,}/.test(password)) {
      analysis.score -= 2;
      analysis.feedback.push('Avoid repeated characters');
    }

    if (/123|abc|qwe/i.test(password)) {
      analysis.score -= 2;
      analysis.feedback.push('Avoid common sequences');
    }

    analysis.isStrong = analysis.score >= 6;
    return analysis;
  }
}