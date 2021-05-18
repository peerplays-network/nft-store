const CustomError = require('./abstracts/custom.error');

class RestError extends CustomError {

  /**
   * @param {String} message
   * @param {Number} status
   * @param {*} [details=null]
   */
  constructor(message, status, details = null) {
    super(message);
    this._status = status;
    this.details = details;
  }

  get status() {
    return this._status;
  }

}

module.exports = RestError;
