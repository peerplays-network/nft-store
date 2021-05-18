const axios = require('axios');
const config = require('../config/settings');
const RestError = require('../errors/rest.error');

class PeerplaysService {
  async register(body) {
    const signupUrl = `${config.peeridUrl}auth/sign-up`;
    return axios.post(signupUrl, body).then((res) => {
      if (res.status !== 200) {
        throw new Error('Peerplays: Unknown error');
      }

      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

  async signIn(body) {
    const signinUrl = `${config.peeridUrl}auth/sign-in`;
    return axios.post(signinUrl, body).then((res) => {
      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

  async loginAndJoinApp(body) {
    const joinUrl = `${config.peeridUrl}auth/token`;
    body['client_id'] = config.peeridClientID;

    return axios.post(joinUrl, body).then((res) => {
      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

  async refreshAccessToken(body) {
    const exchangeUrl = `${config.peeridUrl}auth/refreshtoken`;
    body['client_id'] = config.peeridClientID;
    body['client_secret'] = config.peeridClientSecret;

    return axios.post(exchangeUrl, body).then((res) => {
      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

  async sendOperations(body, access_token) {
    const operationsUrl = `${config.peeridUrl}app/operations`;
    return axios.post(operationsUrl, body, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'ClientID': config.peeridClientID
      }
    }).then((res) => {
      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

  async getBlockchainData(params) {
    const blockchainDataUrl = `${config.peeridUrl}app/blockchain-data`;
    return axios.get(blockchainDataUrl, {params}).then((res) => {
      return res.data;
    }).catch((err) => {
      if(err.response.data) {
        throw new RestError(err.response.data.error, err.response.status);
      } else {
        throw err;
      }
    });
  }

}

module.exports = PeerplaysService;