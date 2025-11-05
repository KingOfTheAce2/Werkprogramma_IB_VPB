// Advanced Input Validation and Sanitization Layer
import validator from 'validator';
import xss from 'xss';
import DOMPurify from 'isomorphic-dompurify';
import { SecurityLogger } from './SecurityLogger.js';

export class InputValidator {
  constructor() {
    this.logger = new SecurityLogger();
    this.maliciousPatterns = [
      // SQL Injection patterns
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
      // XSS patterns
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      // NoSQL injection
      /\$[\w]+/g,
      // Path traversal
      /\.\.[\/\\]/g,
      // Command injection
      /[;&|`$(){}]/g
    ];
  }

  // Comprehensive input validation
  validateRequest(req, res, next) {
    try {
      const sanitizedBody = this.sanitizeObject(req.body, req);
      const sanitizedQuery = this.sanitizeObject(req.query, req);
      const sanitizedParams = this.sanitizeObject(req.params, req);

      req.body = sanitizedBody.data;
      req.query = sanitizedQuery.data;
      req.params = sanitizedParams.data;

      // Log any sanitization actions
      if (sanitizedBody.sanitized || sanitizedQuery.sanitized || sanitizedParams.sanitized) {
        this.logger.logSuspiciousActivity('INPUT_SANITIZED', 
          { id: req.user?.id },
          { ip: req.ip, userAgent: req.get('User-Agent') },
          { 
            riskLevel: 'low',
            automaticActions: ['SANITIZED'],
            details: {
              body: sanitizedBody.sanitized,
              query: sanitizedQuery.sanitized,
              params: sanitizedParams.sanitized
            }
          }
        );
      }

      next();
    } catch (error) {
      this.logger.logSecurityIncident('INPUT_VALIDATION_ERROR', {
        severity: 'medium',
        description: 'Input validation failed',
        evidence: { error: error.message }
      }, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionID
      });

      res.status(400).json({ 
        error: 'Invalid input format',
        code: 'INPUT_VALIDATION_FAILED' 
      });
    }
  }

  // Sanitize object recursively
  sanitizeObject(obj, req, depth = 0) {
    if (depth > 10) { // Prevent deep recursion attacks
      throw new Error('Input nesting too deep');
    }

    const result = { data: {}, sanitized: false };

    if (!obj || typeof obj !== 'object') {
      result.data = this.sanitizeValue(obj, req);
      return result;
    }

    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeKey(key);
      
      if (Array.isArray(value)) {
        const sanitizedArray = this.sanitizeArray(value, req, depth + 1);
        result.data[sanitizedKey] = sanitizedArray.data;
        if (sanitizedArray.sanitized) result.sanitized = true;
      } else if (typeof value === 'object' && value !== null) {
        const sanitizedObj = this.sanitizeObject(value, req, depth + 1);
        result.data[sanitizedKey] = sanitizedObj.data;
        if (sanitizedObj.sanitized) result.sanitized = true;
      } else {
        const sanitized = this.sanitizeValue(value, req);
        result.data[sanitizedKey] = sanitized.value;
        if (sanitized.changed) result.sanitized = true;
      }
    }

    return result;
  }

  // Sanitize array
  sanitizeArray(arr, req, depth = 0) {
    const result = { data: [], sanitized: false };
    
    if (arr.length > 1000) { // Prevent memory exhaustion
      throw new Error('Array too large');
    }

    for (const item of arr) {
      if (Array.isArray(item)) {
        const sanitized = this.sanitizeArray(item, req, depth + 1);
        result.data.push(sanitized.data);
        if (sanitized.sanitized) result.sanitized = true;
      } else if (typeof item === 'object' && item !== null) {
        const sanitized = this.sanitizeObject(item, req, depth + 1);
        result.data.push(sanitized.data);
        if (sanitized.sanitized) result.sanitized = true;
      } else {
        const sanitized = this.sanitizeValue(item, req);
        result.data.push(sanitized.value);
        if (sanitized.changed) result.sanitized = true;
      }
    }

    return result;
  }

  // Sanitize individual value
  sanitizeValue(value, req) {
    const result = { value: value, changed: false };

    if (typeof value !== 'string') {
      return result;
    }

    let sanitized = value;
    const original = value;

    // 1. Basic XSS protection
    sanitized = xss(sanitized, {
      whiteList: {}, // No HTML allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style', 'iframe']
    });

    // 2. Additional DOM purification
    sanitized = DOMPurify.sanitize(sanitized, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });

    // 3. Escape special characters
    sanitized = validator.escape(sanitized);

    // 4. Check for malicious patterns
    for (const pattern of this.maliciousPatterns) {
      if (pattern.test(sanitized)) {
        this.logger.logSecurityIncident('MALICIOUS_INPUT_DETECTED', {
          severity: 'high',
          description: 'Malicious input pattern detected',
          evidence: { 
            pattern: pattern.toString(),
            originalValue: original,
            sanitizedValue: sanitized
          },
          requiresManualReview: true
        }, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID
        });

        sanitized = ''; // Remove completely malicious input
      }
    }

    // 5. Length limits
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
      result.changed = true;
    }

    // 6. Trim whitespace
    sanitized = sanitized.trim();

    result.value = sanitized;
    result.changed = original !== sanitized;

    return result;
  }

  // Sanitize object key
  sanitizeKey(key) {
    if (typeof key !== 'string') {
      return key;
    }

    // Allow only alphanumeric, underscore, and dash
    return key.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  // Validate file uploads
  validateFileUpload(file, options = {}) {
    const {
      maxSize = 50 * 1024 * 1024, // 50MB default
      allowedTypes = ['image/*', 'application/pdf', 'text/*'],
      allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.doc', '.docx', '.xls', '.xlsx']
    } = options;

    const errors = [];

    // Size validation
    if (file.size > maxSize) {
      errors.push(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
    }

    // MIME type validation
    const isAllowedType = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.mimetype.startsWith(type.slice(0, -1));
      }
      return file.mimetype === type;
    });

    if (!isAllowedType) {
      errors.push(`File type not allowed: ${file.mimetype}`);
    }

    // Extension validation
    const fileExt = '.' + file.originalname.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      errors.push(`File extension not allowed: ${fileExt}`);
    }

    // Filename sanitization
    const sanitizedFilename = this.sanitizeFilename(file.originalname);
    if (sanitizedFilename !== file.originalname) {
      file.originalname = sanitizedFilename;
    }

    // Check for executable files
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar'];
    if (dangerousExtensions.includes(fileExt)) {
      errors.push('Executable files are not allowed');
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
      sanitizedFilename: sanitizedFilename
    };
  }

  // Sanitize filename
  sanitizeFilename(filename) {
    // Remove path traversal attempts
    let sanitized = filename.replace(/[\/\\:*?"<>|]/g, '_');
    
    // Remove leading dots
    sanitized = sanitized.replace(/^\.+/, '');
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop();
      const name = sanitized.substring(0, 250 - ext.length);
      sanitized = `${name}.${ext}`;
    }

    return sanitized;
  }

  // Validate client number format
  validateClientNumber(clientNumber) {
    if (!clientNumber || typeof clientNumber !== 'string') {
      return { isValid: false, error: 'Client number is required' };
    }

    // Dutch client number format: typically 6-8 digits
    const sanitized = clientNumber.replace(/[^0-9]/g, '');
    
    if (sanitized.length < 4 || sanitized.length > 8) {
      return { isValid: false, error: 'Invalid client number format' };
    }

    return { isValid: true, sanitized: sanitized };
  }

  // Validate fiscal year
  validateFiscalYear(year) {
    if (!year) {
      return { isValid: false, error: 'Fiscal year is required' };
    }

    const yearNum = parseInt(year);
    const currentYear = new Date().getFullYear();

    if (yearNum < 2000 || yearNum > currentYear + 1) {
      return { isValid: false, error: 'Invalid fiscal year' };
    }

    return { isValid: true, sanitized: yearNum.toString() };
  }

  // Validate email format
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { isValid: false, error: 'Email is required' };
    }

    const sanitized = validator.normalizeEmail(email.trim());
    
    if (!validator.isEmail(sanitized)) {
      return { isValid: false, error: 'Invalid email format' };
    }

    return { isValid: true, sanitized: sanitized };
  }

  // Validate IP address
  validateIPAddress(ip) {
    if (!ip || typeof ip !== 'string') {
      return { isValid: false, error: 'IP address is required' };
    }

    if (!validator.isIP(ip)) {
      return { isValid: false, error: 'Invalid IP address format' };
    }

    return { isValid: true, sanitized: ip };
  }

  // Validate UUID
  validateUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') {
      return { isValid: false, error: 'UUID is required' };
    }

    if (!validator.isUUID(uuid)) {
      return { isValid: false, error: 'Invalid UUID format' };
    }

    return { isValid: true, sanitized: uuid };
  }
}