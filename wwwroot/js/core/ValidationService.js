import { IValidationService } from './IValidationService.js';

/**
 * Concrete implementation of input validation and sanitization
 * Single Responsibility: Validates and sanitizes all user inputs
 */
export class ValidationService extends IValidationService {
    constructor() {
        super();

        // Security patterns to detect
        this.maliciousPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
            /javascript:/gi, // JavaScript protocol
            /on\w+\s*=/gi, // Event handlers
            /eval\s*\(/gi, // Eval calls
            /document\.(write|writeln|createElement)/gi, // DOM manipulation
            /\.innerHTML\s*=/gi, // innerHTML assignment
            /\bXSS\b/gi, // XSS attempts
            /<iframe/gi, // iframes
            /<object/gi, // objects
            /<embed/gi, // embeds
            /<link/gi, // external links
            /<style/gi, // style tags
            /expression\s*\(/gi, // CSS expressions
            /url\s*\(/gi, // URL calls in CSS
            /@import/gi, // CSS imports
        ];

        // Profanity and inappropriate content patterns
        this.inappropriatePatterns = [
            /\b(spam|scam|phishing)\b/gi,
            /\b(hack|exploit|vulnerability)\b/gi,
        ];

        // Room name constraints
        this.ROOM_NAME_MIN_LENGTH = 1;
        this.ROOM_NAME_MAX_LENGTH = 50;
        this.ROOM_NAME_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

        // Message constraints
        this.MESSAGE_MIN_LENGTH = 1;
        this.MESSAGE_MAX_LENGTH = 500;
    }

    /**
     * Validates a room name according to business rules
     * @param {string} roomName 
     * @returns {boolean}
     */
    isValidRoomName(roomName) {
        if (!roomName || typeof roomName !== 'string') {
            return false;
        }

        const trimmed = roomName.trim();

        // Length validation
        if (trimmed.length < this.ROOM_NAME_MIN_LENGTH ||
            trimmed.length > this.ROOM_NAME_MAX_LENGTH) {
            return false;
        }

        // Pattern validation (alphanumeric, spaces, hyphens, underscores)
        if (!this.ROOM_NAME_PATTERN.test(trimmed)) {
            return false;
        }

        // Security validation
        if (this.containsMaliciousContent(trimmed)) {
            return false;
        }

        return true;
    }

    /**
     * Validates a chat message
     * @param {string} message 
     * @returns {boolean}
     */
    isValidMessage(message) {
        if (!message || typeof message !== 'string') {
            return false;
        }

        const trimmed = message.trim();

        // Length validation
        if (trimmed.length < this.MESSAGE_MIN_LENGTH ||
            trimmed.length > this.MESSAGE_MAX_LENGTH) {
            return false;
        }

        // Security validation
        if (this.containsMaliciousContent(trimmed)) {
            return false;
        }

        // Inappropriate content validation
        if (this._containsInappropriateContent(trimmed)) {
            return false;
        }

        return true;
    }

    /**
     * Validates a system message
     * @param {string} message 
     * @returns {boolean}
     */
    isValidSystemMessage(message) {
        if (!message || typeof message !== 'string') {
            return false;
        }

        const trimmed = message.trim();

        // System messages have more relaxed constraints but still need security
        if (trimmed.length === 0 || trimmed.length > 200) {
            return false;
        }

        // Security validation is still important
        return !this.containsMaliciousContent(trimmed);
    }

    /**
     * Sanitizes error messages for safe display
     * @param {string} error 
     * @returns {string}
     */
    sanitizeErrorMessage(error) {
        if (!error || typeof error !== 'string') {
            return "An unknown error occurred";
        }

        // Convert error object to string if needed
        let sanitized = error.toString();

        // Remove potentially sensitive information
        sanitized = sanitized.replace(/at\s+.+\(.+\)/g, ''); // Stack traces
        sanitized = sanitized.replace(/\/[^\/\s]+\/[^\/\s]+/g, ''); // File paths
        sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, ''); // IP addresses

        // Sanitize HTML
        sanitized = this.sanitizeText(sanitized);

        // Limit length
        if (sanitized.length > 200) {
            sanitized = sanitized.substring(0, 197) + "...";
        }

        return sanitized || "An error occurred";
    }

    /**
     * Checks for malicious patterns in input
     * @param {string} input 
     * @returns {boolean}
     */
    containsMaliciousContent(input) {
        if (!input || typeof input !== 'string') {
            return false;
        }

        return this.maliciousPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Sanitizes text for safe display by encoding HTML entities
     * @param {string} text 
     * @returns {string}
     */
    sanitizeText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    /**
     * Validates multiple inputs at once for batch operations
     * @param {object} inputs 
     * @returns {object} Validation results
     */
    validateBatch(inputs) {
        const results = {
            isValid: true,
            errors: {},
            warnings: {}
        };

        if (!inputs || typeof inputs !== 'object') {
            results.isValid = false;
            results.errors.general = "Invalid input object";
            return results;
        }

        // Validate each input field
        Object.keys(inputs).forEach(key => {
            const value = inputs[key];

            switch (key) {
                case 'roomName':
                    if (!this.isValidRoomName(value)) {
                        results.isValid = false;
                        results.errors[key] = "Invalid room name format";
                    }
                    break;

                case 'message':
                    if (!this.isValidMessage(value)) {
                        results.isValid = false;
                        results.errors[key] = "Invalid message content";
                    }
                    break;

                case 'systemMessage':
                    if (!this.isValidSystemMessage(value)) {
                        results.isValid = false;
                        results.errors[key] = "Invalid system message";
                    }
                    break;

                default:
                    // Generic validation for unknown fields
                    if (typeof value === 'string' && this.containsMaliciousContent(value)) {
                        results.isValid = false;
                        results.errors[key] = "Content contains prohibited patterns";
                    }
            }
        });

        return results;
    }

    /**
     * Checks for inappropriate content patterns
     * @param {string} text 
     * @returns {boolean}
     * @private
     */
    _containsInappropriateContent(text) {
        return this.inappropriatePatterns.some(pattern => pattern.test(text));
    }

    /**
     * Validates rate limiting compliance
     * @param {number} lastActionTime 
     * @param {number} cooldownMs 
     * @returns {boolean}
     */
    isRateLimitCompliant(lastActionTime, cooldownMs = 1000) {
        const now = Date.now();
        return (now - lastActionTime) >= cooldownMs;
    }

    /**
     * Validates file upload (for future features)
     * @param {File} file 
     * @param {object} constraints 
     * @returns {object}
     */
    validateFile(file, constraints = {}) {
        const result = {
            isValid: true,
            errors: []
        };

        if (!file) {
            result.isValid = false;
            result.errors.push("No file provided");
            return result;
        }

        // Size validation
        const maxSize = constraints.maxSize || 1024 * 1024; // 1MB default
        if (file.size > maxSize) {
            result.isValid = false;
            result.errors.push(`File too large (max: ${maxSize} bytes)`);
        }

        // Type validation
        const allowedTypes = constraints.allowedTypes || ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            result.isValid = false;
            result.errors.push(`File type not allowed (allowed: ${allowedTypes.join(', ')})`);
        }

        // Name validation
        if (this.containsMaliciousContent(file.name)) {
            result.isValid = false;
            result.errors.push("File name contains prohibited characters");
        }

        return result;
    }

    /**
     * Gets validation configuration for debugging
     * @returns {object}
     */
    getValidationConfig() {
        return {
            roomName: {
                minLength: this.ROOM_NAME_MIN_LENGTH,
                maxLength: this.ROOM_NAME_MAX_LENGTH,
                pattern: this.ROOM_NAME_PATTERN.source
            },
            message: {
                minLength: this.MESSAGE_MIN_LENGTH,
                maxLength: this.MESSAGE_MAX_LENGTH
            },
            maliciousPatterns: this.maliciousPatterns.length,
            inappropriatePatterns: this.inappropriatePatterns.length
        };
    }
} 