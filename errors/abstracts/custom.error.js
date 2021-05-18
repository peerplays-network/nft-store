/** @abstract */
class CustomError {

  constructor(message) {
    this._message = message;
    this._error = new Error();
  }

  get message() {
    return this._message;
  }

  // get name() {
  //   return this.constructor.name;
  // }

}

module.exports = CustomError;
