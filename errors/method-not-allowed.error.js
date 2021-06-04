const RestError = require('./rest.error');

class MethodNotAllowedError extends RestError {

  /** @param [details=null] */
  constructor(details = null) {
    super('Method Not Allowed', 405, details);
  }

}

module.exports = MethodNotAllowedError;
