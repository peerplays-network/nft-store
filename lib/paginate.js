const PeerplaysService = require('../services/PeerplaysService');
const {
    getConfig
} = require('./config');
const peerplaysService = new PeerplaysService();
/**
 * @param  {boolean} frontend // whether or not this is an front or admin call
 * @param  {req} req // express `req` object
 * @param  {integer} page // The page number
 * @param  {string} collection // The collection to search
 * @param  {object} query // The mongo query
 * @param  {object} sort // The mongo sort
 */
const getSellOffers = async (start = 0, k = 0) => {
    const config = getConfig();
    let sellOffers = [];
    const {result} = await peerplaysService.getBlockchainData({
        api: "database",
        method: "list_sell_offers",
        params: [`1.29.${start}`, 100]
    });
    let params = [];

    for(let i = 0; i < result.length; i++) {
        params.push(...result[i].item_ids);
    }

    if(params.length > 0) {
        let nfts;

        try{
            nfts = await peerplaysService.getBlockchainData({
                api: "database",
                method: "get_objects",
                "params[0][]": params
            });
        } catch(err) {
            console.log(err);
        }

        if(nfts) {
            for(let i = 0; i < result.length; i++) {
                result[i].nft_metadata_ids = nfts.result.filter((nft) => result[i].item_ids.includes(nft.id)).map(({nft_metadata_id}) => nft_metadata_id);

                result[i].minimum_price.amount = result[i].minimum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
                result[i].maximum_price.amount = result[i].maximum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
            }
        }
    }

    sellOffers.push(...result);

    if(result.length < 100) {
        return sellOffers;
    }

    const newStart = parseInt(result[99].id.split('.')[2]) + 1;
    sellOffers.push(...await getSellOffers(newStart, k));
    return sellOffers;
}

const paginateData = (frontend, req, page, collection, query, sort) => {
    const db = req.app.db;
    const config = getConfig();
    let numberItems = 10;
    if(frontend){
        numberItems = config.productsPerPage ? config.productsPerPage : 6;
    }

    let skip = 0;
    if(page > 1){
        skip = (page - 1) * numberItems;
    }

    if(!query){
        query = {};
    }
    if(!sort){
        sort = {};
    }

    // Run our queries
    return Promise.all([
        db[collection].find(query).skip(skip).limit(parseInt(numberItems)).sort(sort).toArray(),
        db[collection].countDocuments(query)
    ])
    .then((result) => {
        const returnData = { data: result[0], totalItems: result[1] };
        return returnData;
    })
    .catch((err) => {
        throw new Error('Error retrieving paginated data');
    });
};

/**
 * @param  {boolean} frontend // whether or not this is an front or admin call
 * @param  {req} req // express `req` object
 * @param  {integer} page // The page number
 * @param  {string} collection // The collection to search
 * @param  {object} query // The mongo query
 * @param  {object} sort // The mongo sort
 */
const paginateProducts = (frontend, db, page, query, sort, req) => {
    const config = getConfig();
    let numberItems = 10;
    if(frontend){
        numberItems = config.productsPerPage ? config.productsPerPage : 6;
    }

    let skip = 0;
    if(page > 1){
        skip = (page - 1) * numberItems;
    }

    if(!query){
        query = {};
    }
    if(!sort){
        sort = {};
    }

    // Run our queries
    return db.products.aggregate([
        { $match: query },
        {
            $lookup: {
                from: 'variants',
                localField: '_id',
                foreignField: 'product',
                as: 'variants'
            }
        }
    ]).sort(sort).toArray()
    .then((results) => {
        return getSellOffers().then((offers) => {
            return Promise.all(results.map((result) => peerplaysService.getBlockchainData({
                api: "database",
                method: "get_objects",
                "params[0][]": result.nftMetadataID
            }))).then((metadatas) => {
                let data = [];
                for(let i = 0; i < results.length; i++) {
                  if(metadatas[i] && metadatas[i].result[0] && metadatas[i].result[0].base_uri.includes('/uploads/')) {
                      results[i].base_uri = req.protocol + '://' + req.get('host') + '/imgs' + metadatas[i].result[0].base_uri.split('/uploads')[1];
                  } else if(metadatas[i].result[0] != null){
                         results[i].base_uri = metadatas[i].result[0].base_uri;
                  }
  
                  for(let j = 0; j < offers.length; j++) {
                      if(offers[j] && offers[j].nft_metadata_ids && offers[j].nft_metadata_ids.includes(results[i].nftMetadataID)) {
                          data.push({
                            ...offers[j],
                            ...results[i]
                          });
                      }
                  }
              }
  
              return { data, totalItems: data.length}
            });
        });
    })
    .catch((err) => {
        console.error(err);
        throw new Error('Error retrieving paginated data');
    });
};

const getSort = () => {
    const config = getConfig();
    let sortOrder = -1;
    if(config.productOrder === 'ascending'){
        sortOrder = 1;
    }
    let sortField = 'productAddedDate';
    if(config.productOrderBy === 'title'){
        sortField = 'productTitle';
    }

    return {
        [sortField]: sortOrder
    };
};

module.exports = {
    paginateData,
    paginateProducts,
    getSort
};
