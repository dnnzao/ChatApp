/**
 * Interface for input validation and sanitization
 * Follows Interface Segregation Principle - focused on validation operations only
 */
export class IValidationService {
    /**
     * Validates a room name
     * @param {string} roomName 
     * @returns {boolean}
     */
    isValidRoomName(roomName) {
        throw new Error("Method 'isValidRoomName' must be implemented");
    }

    /**
     * Validates a message
     * @param {string} message 
     * @returns {boolean}
     */
    isValidMessage(message) {
        throw new Error("Method 'isValidMessage' must be implemented");
    }

    /**
     * Validates a system message
     * @param {string} message 
     * @returns {boolean}
     */
    isValidSystemMessage(message) {
        throw new Error("Method 'isValidSystemMessage' must be implemented");
    }

    /**
     * Sanitizes error messages for display
     * @param {string} error 
     * @returns {string}
     */
    sanitizeErrorMessage(error) {
        throw new Error("Method 'sanitizeErrorMessage' must be implemented");
    }

    /**
     * Checks for malicious patterns in input
     * @param {string} input 
     * @returns {boolean}
     */
    containsMaliciousContent(input) {
        throw new Error("Method 'containsMaliciousContent' must be implemented");
    }

    /**
     * Sanitizes text for safe display
     * @param {string} text 
     * @returns {string}
     */
    sanitizeText(text) {
        throw new Error("Method 'sanitizeText' must be implemented");
    }

    /**
     * Validates multiple inputs at once
     * @param {object} inputs 
     * @returns {object} Validation results
     */
    validateBatch(inputs) {
        throw new Error("Method 'validateBatch' must be implemented");
    }
} 