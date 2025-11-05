// Secure Environment Variable Management
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SecurityLogger } from './SecurityLogger.js';

export class EnvironmentManager {
  constructor() {
    this.logger = new SecurityLogger();
    this.encryptedEnvFile = '.env.encrypted';
    this.sensitiveVars = new Set([
      'SESSION_SECRET',
      'SESSION_SECRET_BACKUP', 
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_MFA_SECRET',
      'MASTER_ENCRYPTION_KEY',
      'AZURE_CLIENT_SECRET',
      'AUDITCASE_API_KEY',
      'DATABASE_PASSWORD',
      'DATABASE_URL',
      'REDIS_PASSWORD',
      'SMTP_PASSWORD',
      'ENCRYPTION_PASSWORD'
    ]);
    
    this.requiredVars = new Set([
      'NODE_ENV',
      'PORT',
      'SESSION_SECRET'
    ]);

    this.validationRules = {
      'NODE_ENV': {
        allowedValues: ['development', 'staging', 'production'],
        required: true
      },
      'PORT': {
        type: 'number',
        min: 1,
        max: 65535,
        default: 3000
      },
      'SESSION_SECRET': {
        minLength: 32,
        required: true,
        pattern: /^[A-Za-z0-9+/=]+$/
      },
      'AZURE_CLIENT_ID': {
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      },
      'AZURE_TENANT_ID': {
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      },
      'AUDITCASE_API_KEY': {
        minLength: 16,
        pattern: /^[A-Za-z0-9_-]+$/
      },
      'DATABASE_URL': {
        pattern: /^(postgresql|mysql|mongodb):\/\/.+/
      },
      'REDIS_URL': {
        pattern: /^redis(s)?:\/\/.+/
      }
    };
  }

  // Initialize environment with security checks
  initializeEnvironment() {
    console.log('🔐 Starting secure environment initialization...');
    
    try {
      // Load environment variables
      this.loadEnvironment();
      
      // Validate environment variables
      const validation = this.validateEnvironment();
      
      if (!validation.isValid) {
        console.error('❌ Environment validation failed:', validation.errors);
        throw new Error('Environment validation failed');
      }

      // Check for security issues
      const securityCheck = this.performSecurityCheck();
      
      if (securityCheck.issues.length > 0) {
        console.warn('⚠️ Security issues detected:', securityCheck.issues);
        this.logger.logSecurityIncident('ENVIRONMENT_SECURITY_ISSUES', {
          severity: 'medium',
          description: 'Environment security issues detected',
          evidence: { issues: securityCheck.issues }
        }, { ip: 'system', userAgent: 'environment-manager' });
      }

      // Generate missing secrets
      this.generateMissingSecrets();
      
      // Set secure defaults
      this.setSecureDefaults();

      console.log('✅ Environment initialized securely');
      
      this.logger.logSystemEvent('ENVIRONMENT_INITIALIZED', {
        nodeEnv: process.env.NODE_ENV,
        hasSecrets: this.sensitiveVars.size,
        validationPassed: validation.isValid,
        securityIssues: securityCheck.issues.length
      });

    } catch (error) {
      console.error('💥 Failed to initialize environment:', error.message);
      this.logger.logSecurityIncident('ENVIRONMENT_INIT_FAILED', {
        severity: 'critical',
        description: 'Failed to initialize secure environment',
        evidence: { error: error.message }
      }, { ip: 'system', userAgent: 'environment-manager' });
      
      throw error;
    }
  }

  // Load environment variables from various sources
  loadEnvironment() {
    // Try to load encrypted env first
    if (fs.existsSync(this.encryptedEnvFile)) {
      try {
        this.loadEncryptedEnvironment();
      } catch (error) {
        console.warn('Failed to load encrypted environment, falling back to .env');
      }
    }

    // Load from .env file
    if (fs.existsSync('.env')) {
      const envContent = fs.readFileSync('.env', 'utf8');
      this.parseEnvContent(envContent);
    }

    // Override with system environment variables
    // System vars take precedence for security
  }

  // Parse .env file content
  parseEnvContent(content) {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
      
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  // Validate all environment variables
  validateEnvironment() {
    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check required variables
    for (const varName of this.requiredVars) {
      if (!process.env[varName]) {
        result.errors.push(`Required environment variable ${varName} is missing`);
        result.isValid = false;
      }
    }

    // Validate against rules
    for (const [varName, rules] of Object.entries(this.validationRules)) {
      const value = process.env[varName];
      
      if (rules.required && !value) {
        result.errors.push(`Required variable ${varName} is missing`);
        result.isValid = false;
        continue;
      }

      if (!value && rules.default) {
        process.env[varName] = rules.default.toString();
        result.warnings.push(`Using default value for ${varName}`);
        continue;
      }

      if (value) {
        const validation = this.validateValue(value, rules, varName);
        if (!validation.isValid) {
          result.errors.push(...validation.errors);
          result.isValid = false;
        }
        result.warnings.push(...validation.warnings);
      }
    }

    return result;
  }

  // Validate individual environment variable value
  validateValue(value, rules, varName) {
    const result = { isValid: true, errors: [], warnings: [] };

    // Type validation
    if (rules.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        result.errors.push(`${varName} must be a number`);
        result.isValid = false;
      } else {
        if (rules.min !== undefined && num < rules.min) {
          result.errors.push(`${varName} must be at least ${rules.min}`);
          result.isValid = false;
        }
        if (rules.max !== undefined && num > rules.max) {
          result.errors.push(`${varName} must be at most ${rules.max}`);
          result.isValid = false;
        }
      }
    }

    // Length validation
    if (rules.minLength && value.length < rules.minLength) {
      result.errors.push(`${varName} must be at least ${rules.minLength} characters`);
      result.isValid = false;
    }
    
    if (rules.maxLength && value.length > rules.maxLength) {
      result.errors.push(`${varName} must be at most ${rules.maxLength} characters`);
      result.isValid = false;
    }

    // Pattern validation
    if (rules.pattern && !rules.pattern.test(value)) {
      result.errors.push(`${varName} format is invalid`);
      result.isValid = false;
    }

    // Allowed values
    if (rules.allowedValues && !rules.allowedValues.includes(value)) {
      result.errors.push(`${varName} must be one of: ${rules.allowedValues.join(', ')}`);
      result.isValid = false;
    }

    return result;
  }

  // Perform security checks on environment
  performSecurityCheck() {
    const issues = [];

    // Check for weak secrets
    for (const varName of this.sensitiveVars) {
      const value = process.env[varName];
      if (value) {
        const strength = this.checkSecretStrength(value);
        if (strength.score < 3) {
          issues.push({
            type: 'weak_secret',
            variable: varName,
            issue: 'Secret is too weak',
            recommendations: strength.recommendations
          });
        }
      }
    }

    // Check for default/example values
    const defaultPatterns = [
      'your-secret-here',
      'change-me',
      'default',
      'password',
      '123456',
      'secret'
    ];

    for (const varName of this.sensitiveVars) {
      const value = process.env[varName]?.toLowerCase() || '';
      for (const pattern of defaultPatterns) {
        if (value.includes(pattern)) {
          issues.push({
            type: 'default_value',
            variable: varName,
            issue: 'Using default or example value',
            recommendations: ['Generate a secure random value']
          });
          break;
        }
      }
    }

    // Check for production-specific requirements
    if (process.env.NODE_ENV === 'production') {
      const productionRequired = [
        'HTTPS_ONLY',
        'SESSION_SECRET',
        'MASTER_ENCRYPTION_KEY'
      ];

      for (const varName of productionRequired) {
        if (!process.env[varName]) {
          issues.push({
            type: 'production_missing',
            variable: varName,
            issue: 'Required for production environment',
            recommendations: ['Set this variable for production deployment']
          });
        }
      }

      // Check HTTPS enforcement
      if (process.env.HTTPS_ONLY !== 'true') {
        issues.push({
          type: 'security_config',
          variable: 'HTTPS_ONLY',
          issue: 'HTTPS not enforced in production',
          recommendations: ['Set HTTPS_ONLY=true for production']
        });
      }
    }

    return { issues };
  }

  // Check strength of secret values
  checkSecretStrength(secret) {
    const analysis = {
      score: 0,
      recommendations: []
    };

    // Length check
    if (secret.length >= 32) analysis.score += 2;
    else if (secret.length >= 16) analysis.score += 1;
    else analysis.recommendations.push('Increase length to at least 32 characters');

    // Character variety
    if (/[a-z]/.test(secret)) analysis.score += 1;
    else analysis.recommendations.push('Add lowercase letters');

    if (/[A-Z]/.test(secret)) analysis.score += 1;
    else analysis.recommendations.push('Add uppercase letters');

    if (/[0-9]/.test(secret)) analysis.score += 1;
    else analysis.recommendations.push('Add numbers');

    if (/[^a-zA-Z0-9]/.test(secret)) analysis.score += 2;
    else analysis.recommendations.push('Add special characters');

    // Entropy check (basic)
    const uniqueChars = new Set(secret).size;
    if (uniqueChars / secret.length > 0.7) analysis.score += 1;

    return analysis;
  }

  // Generate missing secrets
  generateMissingSecrets() {
    const generatedSecrets = [];

    for (const varName of this.sensitiveVars) {
      if (!process.env[varName]) {
        const secret = this.generateSecureSecret();
        process.env[varName] = secret;
        generatedSecrets.push(varName);
        
        console.log(`Generated secure secret for ${varName}`);
      }
    }

    if (generatedSecrets.length > 0) {
      this.logger.logSystemEvent('SECRETS_GENERATED', {
        count: generatedSecrets.length,
        variables: generatedSecrets
      });
    }
  }

  // Generate cryptographically secure secret
  generateSecureSecret(length = 64) {
    return crypto.randomBytes(length).toString('base64url');
  }

  // Set secure defaults
  setSecureDefaults() {
    const defaults = {
      'TRUST_PROXY': process.env.NODE_ENV === 'production' ? 'true' : 'false',
      'HTTPS_ONLY': process.env.NODE_ENV === 'production' ? 'true' : 'false',
      'COOKIE_SECURE': process.env.NODE_ENV === 'production' ? 'true' : 'false',
      'SESSION_TIMEOUT': '4h',
      'MAX_REQUEST_SIZE': '10mb',
      'RATE_LIMIT_WINDOW': '15m',
      'RATE_LIMIT_MAX': '100'
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  // Encrypt and save environment file
  encryptEnvironment(password) {
    if (!password || password.length < 32) {
      throw new Error('Encryption password must be at least 32 characters');
    }

    const envContent = this.buildEnvContent();
    const encrypted = this.encryptData(envContent, password);
    
    fs.writeFileSync(this.encryptedEnvFile, encrypted);
    
    console.log('✅ Environment encrypted and saved');
    this.logger.logSystemEvent('ENVIRONMENT_ENCRYPTED', {
      timestamp: new Date().toISOString(),
      variableCount: Object.keys(process.env).length
    });
  }

  // Load encrypted environment
  loadEncryptedEnvironment(password) {
    if (!password) {
      password = process.env.ENV_ENCRYPTION_PASSWORD;
    }

    if (!password) {
      throw new Error('Encryption password required');
    }

    const encryptedContent = fs.readFileSync(this.encryptedEnvFile, 'utf8');
    const decryptedContent = this.decryptData(encryptedContent, password);
    
    this.parseEnvContent(decryptedContent);
    
    console.log('✅ Encrypted environment loaded');
  }

  // Encrypt data using AES-256-GCM
  encryptData(data, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher('aes-256-gcm', key);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encrypted: encrypted
    });
  }

  // Decrypt data
  decryptData(encryptedData, password) {
    const { salt, iv, authTag, encrypted } = JSON.parse(encryptedData);
    const key = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
    
    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Build environment content for saving
  buildEnvContent() {
    const lines = [];
    const sortedKeys = Object.keys(process.env).sort();
    
    for (const key of sortedKeys) {
      // Skip system variables and paths
      if (this.shouldIncludeInEnvFile(key)) {
        const value = process.env[key];
        lines.push(`${key}=${value}`);
      }
    }
    
    return lines.join('\n');
  }

  // Check if variable should be included in env file
  shouldIncludeInEnvFile(key) {
    const systemVars = ['PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'PWD'];
    const excludePatterns = [/^npm_/, /^YARN_/, /^VSCODE_/, /^TERM/];
    
    if (systemVars.includes(key)) return false;
    if (excludePatterns.some(pattern => pattern.test(key))) return false;
    
    return true;
  }

  // Get environment status
  getEnvironmentStatus() {
    const status = {
      nodeEnv: process.env.NODE_ENV,
      totalVars: Object.keys(process.env).length,
      sensitiveVars: Array.from(this.sensitiveVars).filter(key => process.env[key]).length,
      missingRequired: Array.from(this.requiredVars).filter(key => !process.env[key]),
      hasEncryptedFile: fs.existsSync(this.encryptedEnvFile),
      validation: this.validateEnvironment(),
      securityCheck: this.performSecurityCheck()
    };

    return status;
  }

  // Audit environment variables
  auditEnvironment() {
    const audit = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      status: this.getEnvironmentStatus(),
      recommendations: []
    };

    // Generate recommendations
    if (audit.status.missingRequired.length > 0) {
      audit.recommendations.push('Set all required environment variables');
    }

    if (audit.status.securityCheck.issues.length > 0) {
      audit.recommendations.push('Address security issues in environment configuration');
    }

    if (!audit.status.hasEncryptedFile && process.env.NODE_ENV === 'production') {
      audit.recommendations.push('Consider encrypting environment file for production');
    }

    this.logger.logSystemEvent('ENVIRONMENT_AUDIT', audit);
    return audit;
  }

  // Clear sensitive environment variables from memory
  clearSensitiveVars() {
    for (const varName of this.sensitiveVars) {
      if (process.env[varName]) {
        process.env[varName] = '[CLEARED]';
      }
    }
    
    console.log('🧹 Sensitive environment variables cleared from memory');
  }
}

// Export singleton instance
export const environmentManager = new EnvironmentManager();