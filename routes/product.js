/* eslint-disable extra-rules/no-commented-out-code */
/* eslint-disable no-unused-vars */
/* eslint-disable eqeqeq */
const express = require('express');
const { restrict, checkAccess } = require('../lib/auth');
const {
    getId,
    clearSessionValue,
    // eslint-disable-next-line no-unused-vars
    cleanHtml,
    convertBool,
    checkboxBool,
    safeParseInt } = require('../lib/common');
const { indexProducts } = require('../lib/indexing');
const { validateJson } = require('../lib/schema');
const { paginateData } = require('../lib/paginate');
const colors = require('colors');
const rimraf = require('rimraf');
const fs = require('fs');
const path = require('path');
const PeerplaysService = require('../services/PeerplaysService');
const router = express.Router();
const config = require('../config/settings');
const multer = require('multer');

const peerplaysService = new PeerplaysService();

const randomizeLottoName = () => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for(let i = 0; i < 10; i++){ text += possible.charAt(Math.floor(Math.random() * possible.length)); }

  return text;
};

// Config multer for using inside upload middleware
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
      cb(null, `${new Date().toISOString().replace(/[\\/\\:.]/g, '_')}-${file.originalname}`);
  }
});

// Create an upload middleware
const upload = multer({
  storage: imgStorage,
  limits: {
      fieldSize: 1024 * 1024 * 2
  }
});

const getSellOffers = async (start = 0, k = 0) => {
    const sellOffers = [];
    const { result } = await peerplaysService.getBlockchainData({
        api: 'database',
        method: 'list_sell_offers',
        params: [`1.29.${start}`, 100]
    });

    const params = [];

    for(let i = 0; i < result.length; i++){
        params.push(...result[i].item_ids);
    }

    const nfts = await peerplaysService.getBlockchainData({
        api: 'database',
        method: 'get_objects',
        'params[0][]': params
    });

    if(nfts){
        for(let i = 0; i < result.length; i++){
            result[i].nft_metadata_ids = nfts.result.filter((nft) => result[i].item_ids.includes(nft.id)).map(({ nft_metadata_id }) => nft_metadata_id);

            result[i].minimum_price.amount = result[i].minimum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
            result[i].maximum_price.amount = result[i].maximum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
        }
    }

    sellOffers.push(...result);

    if(result.length < 100){
        return sellOffers;
    }
        sellOffers.push(await getSellOffers(start + 100, k));
        return sellOffers;
};

const getAllBidOffers = async (start = 0) => {
  let bidOffers = [];
  const {result} = await peerplaysService.getBlockchainData({
      api: "database",
      method: "list_offers",
      params: [`1.29.${start}`, 100]
  });

  bidOffers.push(...result);

  if(result.length < 100) {
      return bidOffers;
  } else {
      bidOffers.push(await getAllBidOffers(start+100));
      return bidOffers;
  }
}

router.get('/customer/products/:page?', async (req, res, next) => {
    if(!req.session.peerplaysAccountId){
        res.redirect('/customer/login');
        return;
    }

    let pageNum = 1;
    if(req.params.page){
        pageNum = req.params.page;
    }

    let sellFee = 0, mintFee = 0, balance = 0;

    const account = await peerplaysService.getBlockchainData({
        api: "database",
        method: "get_full_accounts",
        "params[0][]": req.session.peerplaysAccountId,
        params: true
    });

    const object200 = await peerplaysService.getBlockchainData({
        api: "database",
        method: "get_objects",
        "params[0][]": "2.0.0",
        params: false
    });

    const mintFees = object200.result[0].parameters.current_fees.parameters.find((fees) => fees[0] === 94);
    mintFee = mintFees[1].fee;

    const sellFees = object200.result[0].parameters.current_fees.parameters.find((fees) => fees[0] === 88);
    sellFee = sellFees[1].fee;

    const assetBalance = account.result[0][1].balances.find((bal) => bal.asset_type === config.peerplaysAssetID);
    balance = assetBalance ? assetBalance.balance : 0;

    // Get our paginated data
    const products = await paginateData(false, req, pageNum, 'products', { owner: req.session.peerplaysAccountId }, { orderDate: -1 });

    const allSellOffers = await getSellOffers();

    if(products && products.data){
        await Promise.all(products.data.map(async (nft) => {
            let metadata, minted, sellOffers;
            try{
                metadata = await peerplaysService.getBlockchainData({
                    api: 'database',
                    method: 'get_objects',
                    'params[0][]': nft.nftMetadataID
                });

                minted = await peerplaysService.getBlockchainData({
                    api: 'database',
                    method: 'nft_get_all_tokens',
                    'params[0]': nft.owner
                });

                sellOffers = allSellOffers ? allSellOffers.filter((s) => s.nft_metadata_ids.includes(nft.nftMetadataID)) : [];
                // eslint-disable-next-line no-undef
                sellOffersCount = sellOffers.reduce((sum, s) => sum + s.item_ids.length, 0);

                minted = minted ? minted.result.filter((m) => m.nft_metadata_id === nft.nftMetadataID) : [];

                const bidOffers = await getAllBidOffers();

                for(let i = 0; i < sellOffers.length; i++) {
                    const bids = bidOffers.filter((bid) => bid.item_ids[0] === sellOffers[i].item_ids[0] && bid.hasOwnProperty('bidder'));
                    await Promise.all(bids.map(async (bid) => {
                      const bidder = await db.customers.findOne({peerplaysAccountId: bid.bidder});
                      bid.bidder = bidder;
                      bid.bid_price.amount = bid.bid_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
                    }));
                    sellOffers[i].bids = bids;
                }

                nft.minted = minted;
                nft.mintedCount = minted.length;
                nft.sellOffers = sellOffers;
                // eslint-disable-next-line no-undef
                nft.sellOffersCount = sellOffersCount;
            }catch(ex){
                console.error(ex);
            }

            if(metadata && metadata.result[0] && metadata.result[0].base_uri.includes('/uploads/')){
                nft.base_uri = `${req.protocol}://${req.get('host')}/imgs${metadata.result[0].base_uri.split('/uploads')[1]}`;
            }else{
                nft.base_uri = metadata.result[0].base_uri;
            }
        }));
    }

    res.render('products', {
        title: 'My NFTs',
        results: products.data,
        totalItemCount: products.totalItems,
        allSellOffers,
        mintFee,
        sellFee,
        balance,
        pageNum,
        paginateUrl: 'customer/products',
        resultType: 'top',
        session: req.session,
        admin: false,
        config: req.app.config,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

router.get('/customer/products/filter/:search', async (req, res, next) => {
    const db = req.app.db;
    const searchTerm = req.params.search;

    // we search on the lunr indexes
    const results = await db.products.find({ $or: [{ productTitle: { $regex: searchTerm, $options: 'i' } }, { productDescription: { $regex: searchTerm, $options: 'i' } }] }).toArray();

    if(req.apiAuthenticated){
        res.status(200).json(results);
        return;
    }

    res.render('products', {
        title: 'Results',
        results: results,
        resultType: 'filtered',
        admin: true,
        config: req.app.config,
        session: req.session,
        searchTerm: searchTerm,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers
    });
});

// insert form
router.get('/customer/product/new', (req, res) => {
    if(!req.session.peerIDAccessToken){
        res.redirect('/customer/login');
        return;
    }

    let createFee = 0, balance = 0;

    const account = await peerplaysService.getBlockchainData({
        api: "database",
        method: "get_full_accounts",
        "params[0][]": req.session.peerplaysAccountId,
        params: true
    });

    const object200 = await peerplaysService.getBlockchainData({
        api: "database",
        method: "get_objects",
        "params[0][]": "2.0.0",
        params: false
    });

    const fees = object200.result[0].parameters.current_fees.parameters.find((fees) => fees[0] === 92);
    createFee = fees[1].fee;
    const createFeeFloat = (fees[1].fee / Math.pow(10, config.peerplaysAssetPrecision)).toFixed(config.peerplaysAssetPrecision);

    const assetBalance = account.result[0][1].balances.find((bal) => bal.asset_type === config.peerplaysAssetID);
    balance = assetBalance ? assetBalance.balance : 0;

    res.render('product-new', {
        title: 'New NFT',
        session: req.session,
        productTitle: clearSessionValue(req.session, 'productTitle'),
        productDescription: clearSessionValue(req.session, 'productDescription'),
        productPermalink: clearSessionValue(req.session, 'productPermalink'),
        createFee,
        createFeeFloat,
        balance,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        editor: true,
        helpers: req.handlebars.helpers,
        config: req.app.config
    });
});

// insert new product form action
router.post('/customer/product/insert', upload.single('productImage'), async (req, res) => {
    const db = req.app.db;
    let filePath = '';
    const doc = {
        nftMetadataID: '1.26.0',
        productTitle: req.body.title,
        productDescription: req.body.productDescription,
        productCategory: req.body.productCategory,
        productPublished: req.body.productPublished == 'true',
        productPermalink: req.body.productPermalink,
        owner: req.session.peerplaysAccountId
    };

    if(req.file){
        filePath = req.file.path;
    }

    // Validate the body again schema
    const schemaValidate = validateJson('newProduct', doc);
    if(!schemaValidate.result){
        if(process.env.NODE_ENV !== 'test'){
            console.log('schemaValidate error', schemaValidate.errors);
        }
        res.status(400).json({
            message: 'Provide inputs at all mandatory fields',
            error: schemaValidate.errors
        });
        return;
    }

    let nftName = randomizeLottoName();

    let body = {
        operations: [{
            op_name: 'nft_metadata_create',
            fee_asset: config.peerplaysAssetID,
            owner: req.session.peerplaysAccountId,
            name: nftName,
            symbol: nftName,
            base_uri: filePath,
            revenue_partner: config.peerplaysAccountID,
            revenue_split: config.commission * 100,
            is_transferable: false,
            is_sellable: true
        }]
    };

    let peerplaysResult = null;
    try{
        peerplaysResult = await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
    }catch(ex){
        res.status(400).json({ message: ex.message });
        return;
    }

    doc.nftMetadataID = peerplaysResult.result.trx.operation_results[0][1];

    try{
        const newDoc = await db.products.insertOne(doc);
        // get the new ID
        const newId = newDoc.insertedId;

        // add to lunr index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({
                message: 'New product successfully created',
                productId: newId
            });
        });
    }catch(ex){
        console.log(colors.red(`Error inserting document: ${ex}`));
        res.status(400).json({ message: 'Error inserting document' });
    }
});

// mint new product form action
// eslint-disable-next-line consistent-return
router.post('/customer/product/mint', async (req, res) => {
    if(!req.session.peerplaysAccountId){
        return res.status(400).json({
            message: 'You need to be logged in to Mint NFT'
        });
    }

    const db = req.app.db;

    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    if(!product){
        return res.status(400).json({
            message: 'Product not found'
        });
    }

    const operations = [];

    for(let i = 0; i < req.body.quantity; i++){
        operations.push({
            op_name: 'nft_mint',
            fee_asset: config.peerplaysAssetID,
            payer: req.session.peerplaysAccountId,
            nft_metadata_id: product.nftMetadataID,
            owner: req.session.peerplaysAccountId,
            approved: req.session.peerplaysAccountId,
            approved_operators: [],
            token_uri: '/'
        });
    }

    const body = { operations };

    try{
        const peerplaysResult = await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
        res.status(200).json({
            message: 'NFT Minted Successfully',
            NFTId: peerplaysResult.result.trx.operation_results[0][1]
        });
    }catch(ex){
        console.error(ex);
        res.status(400).json({ message: 'Error minting NFT' });
    }
});

// sell new product form action
// eslint-disable-next-line consistent-return
router.post('/customer/product/sell', async (req, res) => {
    if(!req.session.peerplaysAccountId){
        return res.status(400).json({
            message: 'You need to be logged in to Sell NFT'
        });
    }

    const db = req.app.db;

    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    if(!product){
        return res.status(400).json({
            message: 'Product not found'
        });
    }

    let minted = []; let sellOffers = []; let availableNFTs = [];

    try{
        minted = await peerplaysService.getBlockchainData({
            api: 'database',
            method: 'nft_get_all_tokens',
            'params[0]': product.owner
        });

        sellOffers = await getSellOffers();
        sellOffers = sellOffers ? sellOffers.filter((s) => s.nft_metadata_ids.includes(product.nftMetadataID)) : [];
        const sellOffersCount = sellOffers.reduce((sum, s) => sum + s.item_ids.length, 0);

        minted = minted ? minted.result.filter((m) => m.nft_metadata_id === product.nftMetadataID) : [];

        if(Number(req.body.quantity) === 0){
            return res.status(400).json({
                message: 'Quantity cannot be zero'
            });
        }

        if(Number(req.body.minPrice) <= 0 && Number(req.body.maxPrice) <= 0){
            return res.status(400).json({
                message: 'Price cannot be zero'
            });
        }

        if(Number(req.body.quantity) > minted.length - sellOffersCount){
            return res.status(400).json({
                message: `Trying to sell ${req.body.quantity} NFTs out of ${minted.length - sellOffersCount} minted NFTs. Please mint more NFTs.`
            });
        }

        if(Date.parse(req.body.expirationDate) <= Date.now()){
            return res.status(400).json({
                message: 'Sale end date cannot be less than current date and time'
            });
        }

        const sellOfferNFTIds = sellOffers.reduce((arr, offer) => arr.concat(offer.item_ids), []);

        availableNFTs = minted.filter((m) => !sellOfferNFTIds.includes(m.id));
    }catch(ex){
        console.error(ex);
        return res.status(400).json({
            message: 'Error fetching data from Blockchain. Please try again later.'
        });
    }

    const operations = [];

    for(let i = 0; i < Number(req.body.quantity); i++){
        operations.push({
            op_name: 'offer',
            fee_asset: config.peerplaysAssetID,
            item_ids: [availableNFTs[i].id],
            issuer: req.session.peerplaysAccountId,
            minimum_price: { amount: req.body.minPrice * Math.pow(10, config.peerplaysAssetPrecision), asset_id: config.peerplaysAssetID },
            maximum_price: { amount: req.body.maxPrice * Math.pow(10, config.peerplaysAssetPrecision), asset_id: config.peerplaysAssetID },
            buying_item: false,
            offer_expiration_date: Math.floor(Date.parse(req.body.expirationDate) / 1000)
        });
    }

    const body = { operations };

    try{
        const peerplaysResult = await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
        res.status(200).json({
            message: 'Sell offer created successfully',
            NFTId: peerplaysResult.result.trx.operation_results[0][1]
        });
    }catch(ex){
        console.error(ex);
        res.status(400).json({ message: 'Error creating sell offer for NFT' });
    }
});

// render the editor
router.get('/customer/product/edit/:id', async (req, res) => {
    if(!req.session.peerplaysAccountId){
        res.redirect('/customer/login');
        return;
    }

    const db = req.app.db;

    const product = await db.products.findOne({ _id: getId(req.params.id) });
    if(!product){
        // If API request, return json
        if(req.apiAuthenticated){
            res.status(400).json({ message: 'Product not found' });
            return;
        }
        req.session.message = 'Product not found';
        req.session.messageType = 'danger';
        res.redirect('/customer/products');
        return;
    }

    // If API request, return json
    if(req.apiAuthenticated){
        res.status(200).json(product);
        return;
    }

    let metadata;

    try{
        metadata = await peerplaysService.getBlockchainData({
            api: 'database',
            method: 'get_objects',
            'params[0][]': product.nftMetadataID
        });
    }catch(ex){
        console.error(ex);
    }

    if(metadata && metadata.result[0] && metadata.result[0].base_uri.includes('/uploads/')){
        product.base_uri = `${req.protocol}://${req.get('host')}/imgs${metadata.result[0].base_uri.split('/uploads')[1]}`;
    }else{
        product.base_uri = metadata.result[0].base_uri;
    }

    res.render('product-edit', {
        title: 'Edit product',
        result: product,
        admin: false,
        session: req.session,
        updateFee,
        updateFeeFloat,
        balance,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        config: req.app.config,
        editor: true,
        helpers: req.handlebars.helpers
    });
});

// // Add a variant to a product
// router.post('/admin/product/addvariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variantDoc = {
//         product: req.body.product,
//         title: req.body.title,
//         price: req.body.price,
//         stock: safeParseInt(req.body.stock) || null
//     };

//     // Validate the body again schema
//     const schemaValidate = validateJson('newVariant', variantDoc);
//     if(!schemaValidate.result){
//         if(process.env.NODE_ENV !== 'test'){
//             console.log('schemaValidate errors', schemaValidate.errors);
//         }
//         res.status(400).json(schemaValidate.errors);
//         return;
//     }

//     // Check product exists
//     const product = await db.products.findOne({ _id: getId(req.body.product) });

//     if(!product){
//         console.log('here1?');
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     // Fix values
//     variantDoc.product = getId(req.body.product);
//     variantDoc.added = new Date();

//     try{
//         const variant = await db.variants.insertOne(variantDoc);
//         product.variants = variant.ops;
//         res.status(200).json({ message: 'Successfully added variant', product });
//     }catch(ex){
//         console.log('here?');
//         res.status(400).json({ message: 'Failed to add variant. Please try again' });
//     }
// });

// // Update an existing product variant
// router.post('/admin/product/editvariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variantDoc = {
//         product: req.body.product,
//         variant: req.body.variant,
//         title: req.body.title,
//         price: req.body.price,
//         stock: safeParseInt(req.body.stock) || null
//     };

//     // Validate the body again schema
//     const schemaValidate = validateJson('editVariant', variantDoc);
//     if(!schemaValidate.result){
//         if(process.env.NODE_ENV !== 'test'){
//             console.log('schemaValidate errors', schemaValidate.errors);
//         }
//         res.status(400).json(schemaValidate.errors);
//         return;
//     }

//     // Validate ID's
//     const product = await db.products.findOne({ _id: getId(req.body.product) });
//     if(!product){
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
//     if(!variant){
//         res.status(400).json({ message: 'Failed to add product variant' });
//         return;
//     }

//     // Removed props not needed
//     delete variantDoc.product;
//     delete variantDoc.variant;

//     try{
//         const updatedVariant = await db.variants.findOneAndUpdate({
//             _id: getId(req.body.variant)
//         }, {
//             $set: variantDoc
//         }, {
//             returnOriginal: false
//         });
//         res.status(200).json({ message: 'Successfully saved variant', variant: updatedVariant.value });
//     }catch(ex){
//         res.status(400).json({ message: 'Failed to save variant. Please try again' });
//     }
// });

// // Remove a product variant
// router.post('/admin/product/removevariant', restrict, checkAccess, async (req, res) => {
//     const db = req.app.db;

//     const variant = await db.variants.findOne({ _id: getId(req.body.variant) });
//     if(!variant){
//         res.status(400).json({ message: 'Failed to remove product variant' });
//         return;
//     }

//     try{
//         // Delete the variant
//         await db.variants.deleteOne({ _id: variant._id }, {});
//         res.status(200).json({ message: 'Successfully removed variant' });
//     }catch(ex){
//         res.status(400).json({ message: 'Failed to remove variant. Please try again' });
//     }
// });

// Update an existing product form action
router.post('/customer/product/update', upload.single('productImage'), async (req, res) => {
    const db = req.app.db;

    const product = await db.products.findOne({ _id: getId(req.body.productID) });

    if(!product){
        res.status(400).json({ message: 'Failed to update product' });
        return;
    }

    const count = await db.products.countDocuments({ productPermalink: req.body.productPermalink, _id: { $ne: getId(product._id) } });
    if(count > 0 && req.body.productPermalink !== ''){
        res.status(400).json({ message: 'Permalink already exists. Pick a new one.' });
        return;
    }

    let filePath = '';

    const productDoc = {
        productId: req.body.productID,
        nftMetadataID: req.body.nftMetadataID,
        productTitle: req.body.title,
        productDescription: req.body.productDescription,
        productCategory: req.body.productCategory,
        // eslint-disable-next-line eqeqeq
        productPublished: req.body.productPublished == 'true',
        productPermalink: req.body.productPermalink,
        owner: req.session.peerplaysAccountId
    };

    if(req.file){
        filePath = req.file.path;
    }

    // Validate the body again schema
    const schemaValidate = validateJson('editProduct', productDoc);
    if(!schemaValidate.result){
        res.status(400).json(schemaValidate.errors);
        return;
    }

    // Remove productId from doc
    delete productDoc.productId;

    if(filePath !== '' || product.productTitle !== req.body.title){
        const op = {
            op_name: 'nft_metadata_update',
            fee_asset: config.peerplaysAssetID,
            owner: req.session.peerplaysAccountId,
            nft_metadata_id: req.body.nftMetadataID
        };

        if(filePath !== ''){
            op.base_uri = filePath;
        }

        if(product.productTitle !== req.body.title){
            op.name = req.body.title;
        }

        const body = {
            operations: [op]
        };

        try{
            await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
        }catch(ex){
            console.error(ex);
            res.status(400).json({ message: ex.message });
            return;
        }
    }

    try{
        await db.products.updateOne({ _id: getId(req.body.productID) }, { $set: productDoc }, {});
        // Update the index
        indexProducts(req.app)
        .then(() => {
            res.status(200).json({ message: 'Successfully saved', product: productDoc });
        });
    }catch(ex){
        res.status(400).json({ message: 'Failed to save. Please try again' });
    }
});

// delete a sell offer
router.post('/customer/product/delete', async (req, res) => {
    const operations = [{
        op_name: 'cancel_offer',
        fee_asset: config.peerplaysAssetID,
        issuer: req.session.peerplaysAccountId,
        offer_id: req.body.offerId
    }];

    const body = { operations };

    try{
        const peerplaysResult = await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
        res.status(200).json({
            message: 'Sell offer cancelled successfully',
            NFTId: peerplaysResult.result.trx.operation_results[0][1]
        });
    }catch(ex){
        console.error(ex);
        res.status(400).json({ message: 'Error cancelling sell offer for NFT' });
    }
});

// update the published state based on an ajax call from the frontend
router.post('/admin/product/publishedState', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        await db.products.updateOne({ _id: getId(req.body.id) }, { $set: { productPublished: convertBool(req.body.state) } }, { multi: false });
        res.status(200).json({ message: 'Published state updated' });
    }catch(ex){
        console.error(colors.red(`Failed to update the published state: ${ex}`));
        res.status(400).json({ message: 'Published state not updated' });
    }
});

// set as main product image
router.post('/admin/product/setasmainimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    try{
        // update the productImage to the db
        await db.products.updateOne({ _id: getId(req.body.product_id) }, { $set: { productImage: req.body.productImage } }, { multi: false });
        res.status(200).json({ message: 'Main image successfully set' });
    }catch(ex){
        res.status(400).json({ message: 'Unable to set as main image. Please try again.' });
    }
});

// deletes a product image
router.post('/admin/product/deleteimage', restrict, checkAccess, async (req, res) => {
    const db = req.app.db;

    // get the productImage from the db
    const product = await db.products.findOne({ _id: getId(req.body.product_id) });
    if(!product){
        res.status(400).json({ message: 'Product not found' });
        return;
    }
    if(req.body.productImage === product.productImage){
        // set the productImage to null
        await db.products.updateOne({ _id: getId(req.body.product_id) }, { $set: { productImage: null } }, { multi: false });

        // remove the image from disk
        fs.unlink(path.join('public', req.body.productImage), (err) => {
            if(err){
                res.status(400).json({ message: 'Image not removed, please try again.' });
            }else{
                res.status(200).json({ message: 'Image successfully deleted' });
            }
        });
    }else{
        // remove the image from disk
        fs.unlink(path.join('public', req.body.productImage), (err) => {
            if(err){
                res.status(400).json({ message: 'Image not removed, please try again.' });
            }else{
                res.status(200).json({ message: 'Image successfully deleted' });
            }
        });
    }
});

module.exports = router;
