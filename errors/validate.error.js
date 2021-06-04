const RestError = require('./rest.error');

class ValidateError extends RestError {

  constructor(status = 400, message = 'Validate error', formErrors = null) {
    super(message, status, formErrors);
  }

  static validateError(formErrors = null) {
    return new ValidateError(400, 'Validate error', formErrors);
  }

}

module.exports = ValidateError;
