const CustomError = require('./abstracts/custom.error');

class PeerplaysNameExistsError extends CustomError {

  /**
   * @param {String} message
   */
  constructor(message) {
    super(message);
  }

}

module.exports = PeerplaysNameExistsError;
