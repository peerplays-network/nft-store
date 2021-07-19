/* eslint-disable consistent-return */
const express = require('express');
const router = express.Router();
const colors = require('colors');
const stripHtml = require('string-strip-html');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ObjectId = require('mongodb').ObjectID;
const {
    getId,
    hooker,
    clearSessionValue,
    getImages,
    addSitemapProducts,
    getCountryList
} = require('../lib/common');
const {
    getSort,
    paginateProducts
} = require('../lib/paginate');
const {
    getPaymentConfig
} = require('../lib/config');
const {
    updateTotalCart,
    emptyCart,
    updateSubscriptionCheck
} = require('../lib/cart');
const {
    createReview,
    getRatingHtml
} = require('../lib/modules/reviews-basic');
const {
    sortMenu,
    getMenu
} = require('../lib/menu');
const countryList = getCountryList();
const PeerplaysService = require('../services/PeerplaysService');
const peerplaysService = new PeerplaysService();

const getAllBidOffers = async (start = 0) => {
    const bidOffers = [];
    const { result } = await peerplaysService.getBlockchainData({
        api: 'database',
        method: 'list_offers',
        params: [`1.29.${start}`, 100]
    });

    bidOffers.push(...result);

    if(result.length < 100){
        return bidOffers;
    }

    const newStart = parseInt(result[99].id.split('.')[2]) + 1;
    bidOffers.push(...await getAllBidOffers(newStart));
    return bidOffers;
};

// Google products
router.get('/googleproducts.xml', async (req, res, next) => {
    let productsFile = '';
    try{
        productsFile = fs.readFileSync(path.join('bin', 'googleproducts.xml'));
    }catch(ex){
        console.log('Google products file not found');
    }
    res.type('text/plain');
    res.send(productsFile);
});

// These is the customer facing routes
router.get('/payment/:orderId', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;

    // Get the order
    const order = await db.orders.findOne({ _id: getId(req.params.orderId) });
    if(!order){
        res.render('error', { title: 'Not found', message: 'Order not found', helpers: req.handlebars.helpers, config });
        return;
    }

    // If stock management is turned on payment approved update stock level
    if(config.trackStock && req.session.paymentApproved){
        // Check to see if already updated to avoid duplicate updating of stock
        if(order.productStockUpdated !== true){
            Object.keys(order.orderProducts).forEach(async (productKey) => {
                const product = order.orderProducts[productKey];
                const dbProduct = await db.products.findOne({ _id: getId(product.productId) });
                let productCurrentStock = dbProduct.productStock;

                // If variant, get the stock from the variant
                if(product.variantId){
                    const variant = await db.variants.findOne({
                        _id: getId(product.variantId),
                        product: getId(product._id)
                    });
                    if(variant){
                        productCurrentStock = variant.stock;
                    }else{
                        productCurrentStock = 0;
                    }
                }

                // Calc the new stock level
                let newStockLevel = productCurrentStock - product.quantity;
                if(newStockLevel < 1){
                    newStockLevel = 0;
                }

                // Update stock
                if(product.variantId){
                    // Update variant stock
                    await db.variants.updateOne({
                        _id: getId(product.variantId)
                    }, {
                        $set: {
                            stock: newStockLevel
                        }
                    }, { multi: false });
                }else{
                    // Update product stock
                    await db.products.updateOne({
                        _id: getId(product.productId)
                    }, {
                        $set: {
                            productStock: newStockLevel
                        }
                    }, { multi: false });
                }

                // Add stock updated flag to order
                await db.orders.updateOne({
                    _id: getId(order._id)
                }, {
                    $set: {
                        productStockUpdated: true
                    }
                }, { multi: false });
            });
            console.info('Updated stock levels');
        }
    }

    // If hooks are configured and the hook has not already been sent, send hook
    if(config.orderHook && !order.hookSent){
        await hooker(order);
        await db.orders.updateOne({
            _id: getId(order._id)
        }, {
            $set: {
                hookSent: true
            }
        }, { multi: false });
    };

    let paymentView = `${config.themeViews}payment-complete`;
    if(order.orderPaymentGateway === 'Blockonomics') paymentView = `${config.themeViews}payment-complete-blockonomics`;
    res.render(paymentView, {
        title: 'Payment complete',
        config: req.app.config,
        session: req.session,
        language: req.cookies.locale || config.defaultLocale,
        result: order,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db))
    });
});

router.get('/emptycart', async (req, res, next) => {
    emptyCart(req, res, '');
});

router.get('/checkout/information', async (req, res, next) => {
    const config = req.app.config;

    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    let paymentType = '';
    if(req.session.cartSubscription){
        paymentType = '_subscription';
    }

    // render the payment page
    res.render(`${config.themeViews}checkout-information`, {
        title: 'Checkout - Information',
        config: req.app.config,
        session: req.session,
        language: req.cookies.locale || config.defaultLocale,
        paymentType,
        cartClose: false,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/shipping', async (req, res, next) => {
    const config = req.app.config;

    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    if(!req.session.customerEmail){
        req.session.message = 'Cannot proceed to shipping without customer information';
        req.session.messageType = 'danger';
        res.redirect('/checkout/information');
        return;
    }

    // Net cart amount
    const netCartAmount = req.session.totalCartAmount - req.session.totalCartShipping || 0;

    // Recalculate shipping
    config.modules.loaded.shipping.calculateShipping(
        netCartAmount,
        config,
        req
    );

    // render the payment page
    res.render(`${config.themeViews}checkout-shipping`, {
        title: 'Checkout - Shipping',
        config: req.app.config,
        session: req.session,
        cartClose: false,
        language: req.cookies.locale || config.defaultLocale,
        cartReadOnly: true,
        page: 'checkout-shipping',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/cart', (req, res) => {
    const config = req.app.config;

    res.render(`${config.themeViews}checkout-cart`, {
        title: 'Checkout - Cart',
        page: req.query.path,
        language: req.cookies.locale || config.defaultLocale,
        config,
        session: req.session,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.get('/checkout/cartdata', (req, res) => {
    const config = req.app.config;

    res.status(200).json({
        cart: req.session.cart,
        session: req.session,
        currencySymbol: config.currencySymbol || '$'
    });
});

router.get('/checkout/payment/:ppyAmount', async (req, res) => {
    const config = req.app.config;
    const imagePath = req.protocol +'://'+ req.get('host');
   
   req.session.cart = {
      ppyAmount: req.params.ppyAmount
    };

    req.session.totalCartAmount = (req.params.ppyAmount * config.ppyExchangeRate).toFixed(2);
    req.session.totalCartShipping = 0;
    req.session.totalCartItems = 1;
    req.session.totalCartProducts = 1;
    // if there is no items in the cart then render a failure
    if(!req.session.cart){
        req.session.message = 'The are no items in your cart. Please add some items before checking out';
        req.session.messageType = 'danger';
        res.redirect('/');
        return;
    }

    res.render(`${config.themeViews}checkout-payment`, {
        title: 'Checkout - Payment',
        config: req.app.config,
        paymentConfig: getPaymentConfig(),
        session: req.session,
        language: req.cookies.locale || config.defaultLocale,
        paymentPage: true,
        imagePath,
        paymentType: '',
        cartClose: true,
        cartReadOnly: true,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        pageUrl: req.originalUrl,
        showFooter: 'showFooter'
    });
});

router.get('/blockonomics_payment', (req, res, next) => {
    const config = req.app.config;
    let paymentType = '';
    if(req.session.cartSubscription){
        paymentType = '_subscription';
    }

    // show bitcoin address and wait for payment, subscribing to wss
    res.render(`${config.themeViews}checkout-blockonomics`, {
        title: 'Checkout - Payment',
        config: req.app.config,
        paymentConfig: getPaymentConfig(),
        session: req.session,
        language: req.cookies.locale || config.defaultLocale,
        paymentPage: true,
        paymentType,
        cartClose: true,
        cartReadOnly: true,
        page: 'checkout-information',
        countryList,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter'
    });
});

router.post('/checkout/adddiscountcode', async (req, res) => {
    const config = req.app.config;
    const db = req.app.db;

    // if there is no items in the cart return a failure
    if(!req.session.cart){
        res.status(400).json({
            message: 'The are no items in your cart.'
        });
        return;
    }

    // Check if the discount module is loaded
    if(!config.modules.loaded.discount){
        res.status(400).json({
            message: 'Access denied.'
        });
        return;
    }

    // Check defined or null
    if(!req.body.discountCode || req.body.discountCode === ''){
        res.status(400).json({
            message: 'Discount code is invalid or expired'
        });
        return;
    }

    // Validate discount code
    const discount = await db.discounts.findOne({ code: req.body.discountCode });
    if(!discount){
        res.status(400).json({
            message: 'Discount code is invalid or expired'
        });
        return;
    }

    // Validate date validity
    if(!moment().isBetween(moment(discount.start), moment(discount.end))){
        res.status(400).json({
            message: 'Discount is expired'
        });
        return;
    }

    // Set the discount code
    req.session.discountCode = discount.code;

    // Update the cart amount
    await updateTotalCart(req, res);

    // Return the message
    res.status(200).json({
        message: 'Discount code applied'
    });
});

router.post('/checkout/removediscountcode', async (req, res) => {
    // if there is no items in the cart return a failure
    if(!req.session.cart){
        res.status(400).json({
            message: 'The are no items in your cart.'
        });
        return;
    }

    // Delete the discount code
    delete req.session.discountCode;

    // update total cart amount
    await updateTotalCart(req, res);

    // Return the message
    res.status(200).json({
        message: 'Discount code removed'
    });
});

// show an individual product
router.get('/product/:id/:offerId', async (req, res) => {
    const db = req.app.db;
    const config = req.app.config;

    const product = await db.products.findOne({ $or: [{ _id: getId(req.params.id) }, { productPermalink: req.params.id }] });
    if(!product){
        res.render('error', { title: 'Not found', message: 'Product not found', helpers: req.handlebars.helpers, config });
        return;
    }
    if(product.productPublished === false){
        res.render('error', { title: 'Not found', message: 'Product not found', helpers: req.handlebars.helpers, config });
        return;
    }

    let metadata, offer, balance, fee, bids, bidFee;

    try{
        metadata = await peerplaysService.getBlockchainData({
            api: 'database',
            method: 'get_objects',
            'params[0][]': product.nftMetadataID
        });
        offer = await peerplaysService.getBlockchainData({
            api: 'database',
            method: 'get_objects',
            'params[0][]': req.params.offerId
        });

        const bidOffers = await getAllBidOffers();
        if(bidOffers && bidOffers.length > 0){
            // eslint-disable-next-line no-prototype-builtins
            bids = bidOffers.filter((bid) => bid.item_ids && bid.item_ids.length > 0 && offer.result[0] && offer.result[0].item_ids.length > 0 && bid.item_ids[0] === offer.result[0].item_ids[0] && bid.hasOwnProperty('bidder'));
            await Promise.all(bids.map(async (bid) => {
              const bidder = await db.customers.findOne({ peerplaysAccountId: bid.bidder });
              bid.bidder = bidder;
              bid.bid_price.amount = bid.bid_price.amount / Math.pow(10, config.peerplaysAssetPrecision);
            }));

            bids = bids.sort((a, b) => b.bid_price.amount - a.bid_price.amount);
        }

        if(req.session.peerplaysAccountId){
            const account = await peerplaysService.getBlockchainData({
                api: 'database',
                method: 'get_full_accounts',
                'params[0][]': req.session.peerplaysAccountId,
                params: true
            });

            const object200 = await peerplaysService.getBlockchainData({
                api: 'database',
                method: 'get_objects',
                'params[0][]': '2.0.0',
                params: true
            });

            const bidFees = object200.result[0].parameters.current_fees.parameters.find((fees) => fees[0] === 89);
            fee = bidFees[1].fee;

            bidFee = (fee / Math.pow(10, config.peerplaysAssetPrecision)).toFixed(config.peerplaysAssetPrecision);

            const assetBalance = account.result[0][1].balances.find((bal) => bal.asset_type === config.peerplaysAssetID);
            balance = assetBalance ? assetBalance.balance : 0;
        }
    }catch(ex){
        console.error(ex);
    }

    if(!metadata || !metadata.result || metadata.result.length === 0 ||
          !offer || !offer.result || offer.result.length === 0){
        res.render('error', { title: 'Not found', message: 'Product not found', helpers: req.handlebars.helpers, config });
        return;
    }

    if(metadata.result[0].base_uri.includes('/uploads/')){
        product.base_uri = `${req.protocol}://${req.get('host')}/imgs${metadata.result[0].base_uri.split('/uploads')[1]}`;
    }else{
        product.base_uri = metadata.result[0].base_uri;
    }

    product.offerId = req.params.offerId;
    if(offer.result[0] && offer.result[0].item_ids.length > 0){
        product.minimum_price = offer.result[0].minimum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);

        product.maximum_price = offer.result[0].maximum_price.amount / Math.pow(10, config.peerplaysAssetPrecision);

        product.is_bidding = product.minimum_price !== product.maximum_price;

        if(bids && bids.length > 0){
            if(bids[0].bid_price.amount === product.maximum_price){
                product.minimum_price = product.maximum_price;
            }else if(bids[0].bid_price.amount < product.maximum_price){
                product.minimum_price = Math.round((bids[0].bid_price.amount * Math.pow(10, config.peerplaysAssetPrecision) + (product.maximum_price * Math.pow(10, config.peerplaysAssetPrecision) - bids[0].bid_price.amount * Math.pow(10, config.peerplaysAssetPrecision)) / 100)) / Math.pow(10, config.peerplaysAssetPrecision);
            }
        }
    }

    // Get variants for this product
    // const variants = await db.variants.find({ product: product._id }).sort({ added: 1 }).toArray();

    // Grab review data
    // const reviews = {
    //     reviews: [],
    //     average: 0,
    //     count: 0,
    //     featured: {},
    //     ratingHtml: '',
    //     highestRating: 0
    // };
    // if(config.modules.enabled.reviews){
    //     reviews.reviews = await db.reviews.find({ product: product._id }).sort({ date: 1 }).limit(5).toArray();
    //     // only aggregate if reviews are found
    //     if(reviews.reviews.length > 0){
    //         reviews.highestRating = await db.reviews.find({ product: product._id }).sort({ rating: -1 }).limit(1).toArray();
    //         if(reviews.highestRating.length > 0){
    //             reviews.highestRating = reviews.highestRating[0].rating;
    //         }
    //         const featuredReview = await db.reviews.find({ product: product._id }).sort({ date: -1 }).limit(1).toArray();
    //         if(featuredReview.length > 0){
    //             reviews.featured.review = featuredReview[0];
    //             reviews.featured.customer = await db.customers.findOne({ _id: reviews.featured.review.customer });
    //         }
    //         const reviewRating = await db.reviews.aggregate([
    //             {
    //                 $match: {
    //                     product: ObjectId(product._id)
    //                 }
    //             },
    //             {
    //                 $group: {
    //                     _id: '$item',
    //                     avgRating: { $avg: '$rating' }
    //                 }
    //             }
    //         ]).toArray();
    //         reviews.count = await db.reviews.countDocuments({ product: product._id });
    //         // Assign if returned
    //         if(reviewRating.length > 0 && reviewRating[0].avgRating){
    //             reviews.average = reviewRating[0].avgRating;
    //         }
    //     }
    //     // Set review html
    //     reviews.ratingHtml = getRatingHtml(Math.round(reviews.average));
    // }

    // If JSON query param return json instead
    if(req.query.json === 'true'){
        res.status(200).json(product);
        return;
    }

    // show the view
    // const images = await getImages(product._id, req, res);

    // Related products
    let relatedProducts = {};
    if(config.showRelatedProducts){
        const searchWords = product.productTitle.split(' ');
        let searchResults = await Promise.all(searchWords.map(async (searchTerm) => {
            const { data } = await paginateProducts(true, db, 1, {
                $or: [
                    { productTitle: { $regex: searchTerm, $options: 'i' } },
                    { productDescription: { $regex: searchTerm, $options: 'i' } }
                ],
                productPublished: true
            }, getSort(), req);
            return data;
        }));

        if(searchResults){
            searchResults = searchResults.reduce((acc, results) => acc.concat(results), []);
            relatedProducts = searchResults.reduce((unique, product) => {
                if(!unique.some(obj => obj.id === product.id) && product.id !== req.params.offerId && unique.length < 4){
                  unique.push(product);
                }
                return unique;
            }, []);
        }
    }

    res.render(`${config.themeViews}product`, {
        title: product.productTitle,
        result: product,
        relatedProducts,
        language: req.cookies.locale || config.defaultLocale,
        balance,
        fee,
        bidFee,
        productDescription: stripHtml(product.productDescription),
        metaDescription: `${config.cartTitle} - ${product.productTitle}`,
        config: config,
        session: req.session,
        pageUrl: req.originalUrl,
        message: clearSessionValue(req.session, 'message'),
        messageType: clearSessionValue(req.session, 'messageType'),
        helpers: req.handlebars.helpers,
        showFooter: 'showFooter',
        menu: sortMenu(await getMenu(db))
    });
});

// Gets the current cart
router.get('/cart/retrieve', async (req, res, next) => {
    const db = req.app.db;

    // Get the cart from the DB using the session id
    let cart = await db.cart.findOne({ sessionId: getId(req.session.id) });

    // Check for empty/null cart
    if(!cart){
        cart = [];
    }

    res.status(200).json({ cart: cart.cart });
});

// Updates a single product quantity
router.post('/product/updatecart', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const cartItem = req.body;

    // Check cart exists
    if(!req.session.cart){
        emptyCart(req, res, 'json', 'There are no items if your cart or your cart is expired');
        return;
    }

    const product = await db.products.findOne({ _id: getId(cartItem.productId) });
    if(!product){
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    // Calculate the quantity to update
    let productQuantity = cartItem.quantity ? cartItem.quantity : 1;
    if(typeof productQuantity === 'string'){
        productQuantity = parseInt(productQuantity);
    }

    if(productQuantity === 0){
        // quantity equals zero so we remove the item
        delete req.session.cart[cartItem.cartId];
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    // Check for a cart
    if(!req.session.cart[cartItem.cartId]){
        res.status(400).json({ message: 'There was an error updating the cart', totalCartItems: Object.keys(req.session.cart).length });
        return;
    }

    const cartProduct = req.session.cart[cartItem.cartId];

    // Set default stock
    let productStock = product.productStock;
    let productPrice = parseFloat(product.productPrice).toFixed(2);

    // Check if a variant is supplied and override values
    if(cartProduct.variantId){
        const variant = await db.variants.findOne({
            _id: getId(cartProduct.variantId),
            product: getId(product._id)
        });
        if(!variant){
            res.status(400).json({ message: 'Error updating cart. Please try again.' });
            return;
        }
        productPrice = parseFloat(variant.price).toFixed(2);
        productStock = variant.stock;
    }

    // If stock management on check there is sufficient stock for this product
    if(config.trackStock){
        // Only if not disabled
        if(product.productStockDisable !== true && productStock){
            // If there is more stock than total (ignoring held)
            if(productQuantity > productStock){
                res.status(400).json({ message: 'There is insufficient stock of this product.' });
                return;
            }

            // Aggregate our current stock held from all users carts
            const stockHeld = await db.cart.aggregate([
                { $match: { sessionId: { $ne: req.session.id } } },
                { $project: { _id: 0 } },
                { $project: { o: { $objectToArray: '$cart' } } },
                { $unwind: '$o' },
                { $group: {
                    _id: {
                        $ifNull: ['$o.v.variantId', '$o.v.productId']
                    },
                    sumHeld: { $sum: '$o.v.quantity' }
                } }
            ]).toArray();

            // If there is stock
            if(stockHeld.length > 0){
                const totalHeld = _.find(stockHeld, ['_id', getId(cartItem.cartId)]).sumHeld;
                const netStock = productStock - totalHeld;

                // Check there is sufficient stock
                if(productQuantity > netStock){
                    res.status(400).json({ message: 'There is insufficient stock of this product.' });
                    return;
                }
            }
        }
    }

    // Update the cart
    req.session.cart[cartItem.cartId].quantity = productQuantity;
    req.session.cart[cartItem.cartId].totalItemPrice = productPrice * productQuantity;

    // update total cart amount
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    // Update cart to the DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    });

    res.status(200).json({ message: 'Cart successfully updated', totalCartItems: Object.keys(req.session.cart).length });
});

// Remove single product from cart
router.post('/product/removefromcart', async (req, res, next) => {
    const db = req.app.db;

    // Check for item in cart
    if(!req.session.cart[req.body.cartId]){
        return res.status(400).json({ message: 'Product not found in cart' });
    }

    // remove item from cart
    delete req.session.cart[req.body.cartId];

    // If not items in cart, empty it
    if(Object.keys(req.session.cart).length === 0){
        return emptyCart(req, res, 'json');
    }

    // Update cart in DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    });
    // update total cart
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    return res.status(200).json({ message: 'Product successfully removed', totalCartItems: Object.keys(req.session.cart).length });
});

// Totally empty the cart
router.post('/product/emptycart', async (req, res, next) => {
    emptyCart(req, res, 'json');
});

// Add item to cart
router.post('/product/addtocart', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    let productQuantity = req.body.productQuantity ? parseInt(req.body.productQuantity) : 1;
    const productComment = req.body.productComment ? req.body.productComment : null;

    // If maxQuantity set, ensure the quantity doesn't exceed that value
    if(config.maxQuantity && productQuantity > config.maxQuantity){
        return res.status(400).json({
            message: 'The quantity exceeds the max amount. Please contact us for larger orders.'
        });
    }

    // Don't allow negative quantity
    if(productQuantity < 1){
        productQuantity = 1;
    }

    // setup cart object if it doesn't exist
    if(!req.session.cart){
        req.session.cart = {};
    }

    // Get the product from the DB
    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    // No product found
    if(!product){
        return res.status(400).json({ message: 'Error updating cart. Please try again.' });
    }

    // If cart already has a subscription you cannot add anything else
    if(req.session.cartSubscription){
        return res.status(400).json({ message: 'Subscription already existing in cart. You cannot add more.' });
    }

    // If existing cart isn't empty check if product is a subscription
    if(Object.keys(req.session.cart).length !== 0){
        if(product.productSubscription){
            return res.status(400).json({ message: 'You cannot combine subscription products with existing in your cart. Empty your cart and try again.' });
        }
    }

    // Variant checks
    let productCartId = product._id.toString();
    let productPrice = parseFloat(product.productPrice).toFixed(2);
    let productVariantId;
    let productVariantTitle;
    let productStock = product.productStock;

    // Check if a variant is supplied and override values
    if(req.body.productVariant){
        const variant = await db.variants.findOne({
            _id: getId(req.body.productVariant),
            product: getId(req.body.productId)
        });
        if(!variant){
            return res.status(400).json({ message: 'Error updating cart. Variant not found.' });
        }
        productVariantId = getId(req.body.productVariant);
        productVariantTitle = variant.title;
        productCartId = req.body.productVariant;
        productPrice = parseFloat(variant.price).toFixed(2);
        productStock = variant.stock;
    }

    // If stock management on check there is sufficient stock for this product
    if(config.trackStock){
        // Only if not disabled
        if(product.productStockDisable !== true && productStock){
            // If there is more stock than total (ignoring held)
            if(productQuantity > productStock){
                return res.status(400).json({ message: 'There is insufficient stock of this product.' });
            }

            // Aggregate our current stock held from all users carts
            const stockHeld = await db.cart.aggregate([
                { $project: { _id: 0 } },
                { $project: { o: { $objectToArray: '$cart' } } },
                { $unwind: '$o' },
                { $group: {
                    _id: {
                        $ifNull: ['$o.v.variantId', '$o.v.productId']
                    },
                    sumHeld: { $sum: '$o.v.quantity' }
                } }
            ]).toArray();

            // If there is stock
            if(stockHeld.length > 0){
                const heldProduct = _.find(stockHeld, ['_id', getId(productCartId)]);
                if(heldProduct){
                    const netStock = productStock - heldProduct.sumHeld;

                    // Check there is sufficient stock
                    if(productQuantity > netStock){
                        return res.status(400).json({ message: 'There is insufficient stock of this product.' });
                    }
                }
            }
        }
    }

    // if exists we add to the existing value
    let cartQuantity = 0;
    if(req.session.cart[productCartId]){
        cartQuantity = parseInt(req.session.cart[productCartId].quantity) + productQuantity;
        req.session.cart[productCartId].quantity = cartQuantity;
        req.session.cart[productCartId].totalItemPrice = productPrice * parseInt(req.session.cart[productCartId].quantity);
    }else{
        // Set the card quantity
        cartQuantity = productQuantity;

        // new product deets
        const productObj = {};
        productObj.productId = product._id;
        productObj.title = product.productTitle;
        productObj.quantity = productQuantity;
        productObj.totalItemPrice = productPrice * productQuantity;
        productObj.productImage = product.productImage;
        productObj.productComment = productComment;
        productObj.productSubscription = product.productSubscription;
        productObj.variantId = productVariantId;
        productObj.variantTitle = productVariantTitle;
        if(product.productPermalink){
            productObj.link = product.productPermalink;
        }else{
            productObj.link = product._id;
        }

        // merge into the current cart
        req.session.cart[productCartId] = productObj;
    }

    // Update cart to the DB
    await db.cart.updateOne({ sessionId: req.session.id }, {
        $set: { cart: req.session.cart }
    }, { upsert: true });

    // update total cart amount
    await updateTotalCart(req, res);

    // Update checking cart for subscription
    updateSubscriptionCheck(req, res);

    if(product.productSubscription){
        req.session.cartSubscription = product.productSubscription;
    }

    return res.status(200).json({
        message: 'Cart successfully updated',
        cartId: productCartId,
        totalCartItems: req.session.totalCartItems
    });
});

// Bid on NFT
router.post('/product/bid', async (req, res, next) => {
    if(!req.session.peerplaysAccountId){
        return res.status(400).json({
            message: 'You need to be logged in to bid on NFT'
        });
    }

    const db = req.app.db;
    const config = req.app.config;

    // Get the product from the DB
    const product = await db.products.findOne({ _id: getId(req.body.productId) });

    // No product found
    if(!product){
        return res.status(400).json({ message: 'Error placing bid. Please try again.' });
    }

    const productPrice = Math.round((parseFloat(req.body.productPrice) + Number.EPSILON) * Math.pow(10, config.peerplaysAssetPrecision));

    const offer = await peerplaysService.getBlockchainData({
        api: 'database',
        method: 'get_objects',
        'params[0][]': req.body.offerId
    });

    const isBidding = offer.result[0].minimum_price.amount !== offer.result[0].maximum_price.amount;

    if(offer && offer.result.length > 0 && offer.result[0].issuer && offer.result[0].issuer === req.session.peerplaysAccountId){
        return res.status(400).json({ message: isBidding ? 'You cannot bid on your own NFT' : 'You cannot buy your own NFT' });
    }

    const body = {
        operations: [{
            op_name: 'bid',
            fee_asset: config.peerplaysAssetID,
            bidder: req.session.peerplaysAccountId,
            bid_price: {
                amount: productPrice,
                asset_id: config.peerplaysAssetID
            },
            offer_id: req.body.offerId
        }]
    };

    let bidId;

    try{
        const { result } = await peerplaysService.sendOperations(body, req.session.peerIDAccessToken);
        bidId = result.trx.operation_results[0][1];
        return res.status(200).json({
            message: isBidding ? 'Bid placed successfully' : 'NFT bought successfully',
            bidId
        });
    }catch(ex){
        console.error(ex);
        res.status(400).json({ message: 'Error bidding on/buying NFTs' });
    }
});

// Totally empty the cart
router.post('/product/addreview', async (req, res, next) => {
    const config = req.app.config;

    // Check if module enabled
    if(config.modules.enabled.reviews){
        // Check if a customer is logged in
        if(!req.session.customerPresent){
            return res.status(400).json({
                message: 'You need to be logged in to add a review'
            });
        }

        // Validate inputs
        if(!req.body.title){
            return res.status(400).json({
                message: 'Please supply a review title'
            });
        }
        if(!req.body.description){
            return res.status(400).json({
                message: 'Please supply a review description'
            });
        }
        if(!req.body.rating){
            return res.status(400).json({
                message: 'Please supply a review rating'
            });
        }

        // Sanitize inputs
        req.body.title = stripHtml(req.body.title);
        req.body.description = stripHtml(req.body.description);

        // Validate length
        if(req.body.title.length > 50){
            return res.status(400).json({
                message: 'Review title is too long'
            });
        }
        if(req.body.description.length > 200){
            return res.status(400).json({
                message: 'Review description is too long'
            });
        }

        // Check rating is within range
        try{
            const rating = parseInt(req.body.rating);
            if(rating < 0 || rating > 5){
                return res.status(400).json({
                    message: 'Please supply a valid rating'
                });
            }

            // Check for failed Int conversion
            if(isNaN(rating)){
                return res.status(400).json({
                    message: 'Please supply a valid rating'
                });
            }

            // Set rating to be numeric
            req.body.rating = rating;
        }catch(ex){
            return res.status(400).json({
                message: 'Please supply a valid rating'
            });
        }

        // Checks passed, create the review
        const response = await createReview(req);
        if(response.error){
            return res.status(400).json({
                message: response.error
            });
        }
        return res.json({
            message: 'Review successfully submitted'
        });
    }
    return res.status(400).json({
        message: 'Unable to submit review'
    });
});

// search products
router.get('/search/:searchTerm?/:pageNum?', (req, res) => {
    const db = req.app.db;
    const searchTerm = req.params.searchTerm ? req.params.searchTerm : '';
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;
    let pageNum = 1;
    if(req.params.pageNum){
        pageNum = req.params.pageNum;
    }

    Promise.all([
        paginateProducts(true, db, pageNum, {
            $or: [
                { productTitle: { $regex: searchTerm, $options: 'i' } },
                { productDescription: { $regex: searchTerm, $options: 'i' } }
            ],
            productPublished: true
        }, getSort(), req),
        getMenu(db)
    ])
    .then(([results, menu]) => {
        // If JSON query param return json instead
        if(req.query.json === 'true'){
            res.status(200).json(results.data);
            return;
        }

        res.render(`${config.themeViews}index`, {
            title: 'Results',
            results: results.data,
            language: req.cookies.locale || config.defaultLocale,
            filtered: true,
            session: req.session,
            metaDescription: `${req.app.config.cartTitle} - Search term: ${searchTerm}`,
            searchTerm: searchTerm,
            message: clearSessionValue(req.session, 'message'),
            messageType: clearSessionValue(req.session, 'messageType'),
            productsPerPage: numberProducts,
            totalProductCount: results.totalItems,
            pageNum: pageNum,
            paginateUrl: 'search',
            pageUrl: req.originalUrl,
            config: config,
            menu: sortMenu(menu),
            helpers: req.handlebars.helpers,
            showFooter: 'showFooter'
        });
    })
    .catch((err) => {
        console.error(colors.red('Error searching for products', err));
    });
});

// search products
router.get('/category/:cat/:pageNum?', (req, res) => {
    const db = req.app.db;
    const searchTerm = req.params.cat;
    const productsIndex = req.app.productsIndex;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    const lunrIdArray = [];
    productsIndex.search(searchTerm).forEach((id) => {
        lunrIdArray.push(getId(id.ref));
    });

    let pageNum = 1;
    if(req.params.pageNum){
        pageNum = req.params.pageNum;
    }

    Promise.all([
        paginateProducts(true, db, pageNum, { _id: { $in: lunrIdArray } }, getSort(), req),
        getMenu(db)
    ])
        .then(([results, menu]) => {
            const sortedMenu = sortMenu(menu);

            // If JSON query param return json instead
            if(req.query.json === 'true'){
                res.status(200).json(results.data);
                return;
            }

            res.render(`${config.themeViews}index`, {
                title: `Category: ${searchTerm}`,
                results: results.data,
                filtered: true,
                language: req.cookies.locale || config.defaultLocale,
                session: req.session,
                searchTerm: searchTerm,
                metaDescription: `${req.app.config.cartTitle} - Category: ${searchTerm}`,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                productsPerPage: numberProducts,
                totalProductCount: results.totalItems,
                pageNum: pageNum,
                menuLink: _.find(sortedMenu.items, (obj) => { return obj.link === searchTerm; }),
                paginateUrl: 'category',
                config: config,
                menu: sortedMenu,
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter'
            });
        })
        .catch((err) => {
            console.error(colors.red('Error getting products for category', err));
        });
});

// Language setup in cookie
router.get('/lang/:locale/:redirectUri', (req, res) => {
    res.cookie('locale', req.params.locale, { maxAge: 900000, httpOnly: true });

    if(req.params.redirectUri){
        res.redirect(req.params.redirectUri);
    }else{
        res.redirect('back');
    }
});

// return sitemap
router.get('/sitemap.xml', (req, res, next) => {
    const sm = require('sitemap');
    const config = req.app.config;

    addSitemapProducts(req, res, (err, products) => {
        if(err){
            console.error(colors.red('Error generating sitemap.xml', err));
        }
        const sitemap = sm.createSitemap(
            {
                hostname: config.baseUrl,
                cacheTime: 600000,
                urls: [
                    { url: '/', changefreq: 'weekly', priority: 1.0 }
                ]
            });

        const currentUrls = sitemap.urls;
        const mergedUrls = currentUrls.concat(products);
        sitemap.urls = mergedUrls;
        // render the sitemap
        sitemap.toXML((err, xml) => {
            if(err){
                return res.status(500).end();
            }
            res.header('Content-Type', 'application/xml');
            res.send(xml);
            return true;
        });
    });
});

router.get('/page/:pageNum', (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    Promise.all([
        paginateProducts(true, db, req.params.pageNum, {}, getSort(), req),
        getMenu(db)
    ])
        .then(([results, menu]) => {
            // If JSON query param return json instead
            if(req.query.json === 'true'){
                res.status(200).json(results.data);
                return;
            }

            res.render(`${config.themeViews}index`, {
                title: 'Shop',
                results: results.data,
                session: req.session,
                language: req.cookies.locale || config.defaultLocale,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                metaDescription: `${req.app.config.cartTitle} - Products page: ${req.params.pageNum}`,
                config: req.app.config,
                productsPerPage: numberProducts,
                totalProductCount: results.totalItems,
                pageNum: req.params.pageNum,
                pageUrl: req.originalUrl,
                paginateUrl: 'page',
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(menu)
            });
        })
        .catch((err) => {
            console.error(colors.red('Error getting products for page', err));
        });
});

// The main entry point of the shop
router.get('/:page?', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const numberProducts = config.productsPerPage ? config.productsPerPage : 6;

    // if no page is specified, just render page 1 of the cart
    if(!req.params.page){
        Promise.all([
            paginateProducts(true, db, 1, { productPublished: true }, getSort(), req),
            getMenu(db)
        ])
            .then(async([results, menu]) => {
                // If JSON query param return json instead
                if(req.query.json === 'true'){
                    res.status(200).json(results.data);
                    return;
                }

                res.render(`${config.themeViews}index`, {
                    title: `${config.cartTitle} - Shop`,
                    theme: config.theme,
                    language: req.cookies.locale || config.defaultLocale,
                    results: results.data,
                    session: req.session,
                    message: clearSessionValue(req.session, 'message'),
                    messageType: clearSessionValue(req.session, 'messageType'),
                    config,
                    productsPerPage: numberProducts,
                    totalProductCount: results.totalItems,
                    pageNum: 1,
                    pageUrl: req.originalUrl,
                    paginateUrl: 'page',
                    helpers: req.handlebars.helpers,
                    showFooter: 'showFooter',
                    menu: sortMenu(menu)
                });
            })
            .catch((err) => {
                console.error(colors.red('Error getting products for page', err));
            });
    }else{
        if(req.params.page === 'admin'){
            next();
            return;
        }
        // lets look for a page
        const page = await db.pages.findOne({ pageSlug: req.params.page, pageEnabled: 'true' });
        // if we have a page lets render it, else throw 404
        if(page){
            res.render(`${config.themeViews}page`, {
                title: page.pageName,
                page: page,
                searchTerm: req.params.page,
                language: req.cookies.locale || config.defaultLocale,
                session: req.session,
                message: clearSessionValue(req.session, 'message'),
                messageType: clearSessionValue(req.session, 'messageType'),
                config: req.app.config,
                metaDescription: `${req.app.config.cartTitle} - ${page}`,
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(await getMenu(db))
            });
        }else{
            res.status(404).render('error', {
                title: '404 Error - Page not found',
                config: req.app.config,
                message: '404 Error - Page not found',
                helpers: req.handlebars.helpers,
                showFooter: 'showFooter',
                menu: sortMenu(await getMenu(db))
            });
        }
    }
});

module.exports = router;
